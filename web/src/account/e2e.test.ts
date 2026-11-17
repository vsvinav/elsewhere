// End to end: the real web account client and vault crypto against the real account Worker, started in-process with
// wrangler's unstable_dev and DEV_MAIL=1 so the code comes back in the response instead of a mail.
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it, vi } from 'vitest'

// The sync engine keeps its bookkeeping in the browser store; here that is a map, wiped to play a second device.
const db = vi.hoisted(() => ({ store: new Map<string, unknown>() }))
vi.mock('../ingest/db', () => ({ kv: { get: async (k: string) => db.store.get(k), set: async (k: string, v: unknown) => { db.store.set(k, v) }, del: async (k: string) => { db.store.delete(k) } } }))
vi.hoisted(() => {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) })
})

import { accountClient, AccountError } from './client'
import { deriveKey, newSalt, openVault, sealVault, type VaultPlain } from './vault'
import { generateKeys, toHex } from '../crew/keys'
import type { Data, Visit } from '../data/types'
import { profile } from '../profile/profile'
import { pull, push } from '../sync/engine'
import { loadSyncedStays } from '../sync/local'
import { importSource, newSyncKey, stayId } from '../sync/wire'

interface Service { url: string; stop(): Promise<void> }

async function startService(): Promise<Service | null> {
  const dir = fileURLToPath(new URL('../../../account/', import.meta.url))
  try {
    const wrangler = await import(/* @vite-ignore */ `${dir}node_modules/wrangler/wrangler-dist/cli.js`)
    const w = await wrangler.unstable_dev(`${dir}src/index.ts`, {
      config: `${dir}wrangler.toml`, port: 0, logLevel: 'error', persist: false, vars: { DEV_MAIL: '1' }, experimental: { disableExperimentalWarning: true },
    })
    const url = `http://${w.address}:${w.port}`
    for (let i = 0; i < 50; i++) {
      const ok = await fetch(`${url}/health`).then((r) => r.ok, () => false)
      if (ok) return { url, stop: () => w.stop() }
      await new Promise((r) => setTimeout(r, 100))
    }
    await w.stop()
  } catch (e) {
    // A laptop without workerd skips this file; CI has it and must not silently pass.
    if (process.env.CI) throw e
  }
  return null
}

const svc = await startService()
afterAll(async () => { await svc?.stop() })

/** A browser: a session slot and a client bound to it. */
function device() {
  let session: string | null = null
  let lost = 0
  const client = accountClient(svc!.url, { session: () => session, onUnauthorized: () => { lost++; session = null } })
  return { client, get session() { return session }, set session(s) { session = s }, get lost() { return lost } }
}

describe.skipIf(!svc)('account service end to end', () => {
  const email = `e2e-${Date.now()}@example.org`

  it('signs up by code, seals a vault, then a second device signs in and opens the same vault', async () => {
    const a = device()
    const started = await a.client.start(email)
    expect(started.dev?.code).toMatch(/^\d{6}$/)
    const fin = await a.client.finish({ email, code: `${started.dev!.code.slice(0, 3)} ${started.dev!.code.slice(3)}` })
    expect(fin.session).toMatch(/^[0-9a-f]{64}$/)
    expect(fin.account.email).toBe(email)
    expect(fin.account.hasVault).toBe(false)
    a.session = fin.session
    expect(await a.client.getVault()).toBeNull()

    const keys = generateKeys()
    const plain: VaultPlain = { v: 1, signPriv: toHex(keys.signPriv), kxPriv: toHex(keys.kxPriv), profile: { name: 'Vinav', units: 'km', homes: [], works: [] }, settings: { units: 'km', relayUrl: 'https://relay.example.org' } }
    const salt = newSalt()
    const key = await deriveKey('correct horse battery', salt)
    await a.client.putVault(await sealVault(key, salt, plain))
    expect((await a.client.me()).hasVault).toBe(true)

    const b = device()
    const again = await b.client.start(email)
    expect(again.dev).toEqual({ code: expect.stringMatching(/^\d{6}$/) })
    const secondDevice = await b.client.finish({ email, code: again.dev!.code })
    expect(secondDevice.account.id).toBe(fin.account.id)
    b.session = secondDevice.session
    const body = (await b.client.getVault())!
    if (body.v !== 1) throw new Error('expected a passphrase vault')
    const opened = await openVault(await deriveKey('correct horse battery', Buffer.from(body.salt, 'base64')), body)
    expect(opened.signPriv).toBe(plain.signPriv)
    expect(opened.kxPriv).toBe(plain.kxPriv)
    expect(opened.profile.name).toBe('Vinav')
    await expect(openVault(await deriveKey('wrong passphrase', Buffer.from(body.salt, 'base64')), body)).rejects.toThrow()

    await a.client.logout()
    await expect(a.client.me()).rejects.toMatchObject({ status: 401 })
    await b.client.deleteMe()
    const c = device()
    const fresh = await c.client.start(email)
    c.session = (await c.client.finish({ email, code: fresh.dev!.code })).session
    expect(await c.client.getVault()).toBeNull()
  })

  it('a wrong code is refused and a used code cannot be replayed', async () => {
    const d = device()
    const other = `e2e-b-${Date.now()}@example.org`
    const started = await d.client.start(other)
    const wrong = started.dev!.code === '000000' ? '111111' : '000000'
    await expect(d.client.finish({ email: other, code: wrong })).rejects.toMatchObject({ status: 401, code: 'wrong code' })
    await d.client.finish({ email: other, code: started.dev!.code })
    const replay = d.client.finish({ email: other, code: started.dev!.code })
    await expect(replay).rejects.toBeInstanceOf(AccountError)
  })

  it('one device pushes two months, a second pulls them, and Start fresh leaves nothing behind', async () => {
    const mail = `e2e-sync-${Date.now()}@example.org`
    const a = device()
    a.session = (await a.client.finish({ email: mail, code: (await a.client.start(mail)).dev!.code })).session
    const key = newSyncKey()
    const sha = 'f'.repeat(64)
    const visit = (id: number, start: number): Visit => ({ id, start, end: start + 3600, tz: 0, place_id: 'p1', lat: 48.85, lng: 2.35, type: 'VISIT', p: 1, lvl: 0 })
    const dec = Date.UTC(2025, 11, 31, 23) / 1000, jan = Date.UTC(2026, 0, 1, 1) / 1000
    const rec = {
      visits: [visit(1, dec), visit(2, jan)], activities: [], strokes: [], paths: [], daily: [], trips: [],
      places: { p1: { lat: 48.85, lng: 2.35, label: null, role: null, city: 'Paris', country_code: 'FR', n_visits: 2, total_hours: 2, first_ts: dec, last_ts: jan, name: 'Café' } },
      profile: { home: { lat: 0, lng: 0 }, homes: [], works: [], frequent_places: [], frequent_trips: [], persona: null },
      meta: { source_file: 'x.json', source_sha256: sha, built_at: 0, range: [dec, jan] as [number, number], import_report: { segments_total: 0, parsed: 0, skipped_by_reason: {} } },
    } satisfies Data
    profile.set({ name: 'Vinav', units: 'mi', homes: [], works: [] })
    await push(key, { client: () => a.client, record: () => rec })
    const src = importSource(sha)
    expect((await a.client.listSync()).map((e) => e.key).sort()).toEqual([`${src}:2025-12`, `${src}:2026-01`, 'profile'])

    db.store.clear(); profile.set(null)
    const b = device()
    b.session = (await b.client.finish({ email: mail, code: (await b.client.start(mail)).dev!.code })).session
    await pull(key, { client: () => b.client })
    const stays = await loadSyncedStays()
    expect(Object.keys(stays).sort()).toEqual([stayId(src, dec), stayId(src, jan)].sort())
    expect(stays[stayId(src, jan)]).toMatchObject({ name: 'Café', start: jan, end: jan + 3600 })
    expect(profile.get()).toMatchObject({ name: 'Vinav', units: 'mi' })

    await b.client.deleteSync()
    expect(await b.client.listSync()).toEqual([])
    db.store.clear()
    await pull(key, { client: () => a.client })
    expect(await loadSyncedStays()).toEqual({})
    await a.client.deleteMe()
  })

  it('a stale session on an authed call clears the device session', async () => {
    const d = device()
    d.session = 'f'.repeat(64)
    await expect(d.client.me()).rejects.toMatchObject({ status: 401 })
    expect(d.lost).toBe(1)
    expect(d.session).toBeNull()
  })
})
