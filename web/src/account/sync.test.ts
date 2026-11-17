import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ store: new Map<string, unknown>() }))
vi.mock('../ingest/db', () => ({ kv: { get: async (k: string) => db.store.get(k), set: async (k: string, v: unknown) => { db.store.set(k, v) }, del: async (k: string) => { db.store.delete(k) } } }))
vi.hoisted(() => {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) })
})

import { b64, fromHex, keysFromSeeds, toHex } from '../crew/keys'
import { settings } from '../ingest/settings'
import { profile, type Profile } from '../profile/profile'
import type { AccountClient } from './client'
import { resetAccountForTest, useAccount } from './store'
import { markUploaded, startVaultSync, uploadVault, vaultStatus } from './sync'
import { deriveKey, openVault, type VaultBody } from './vault'

const KEYS = keysFromSeeds(fromHex('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60'), fromHex('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a'))
const ADA: Profile = { name: 'Ada', units: 'km', homes: [{ lat: 51.5, lng: -0.12, city: 'London', cc: 'GB', from: 0, to: null }], works: [] }
const SALT = new Uint8Array(16).fill(7)
let key: Uint8Array
const fakeClient = () => {
  const puts: VaultBody[] = []
  let fail = false
  const client = { putVault: async (b: VaultBody) => { if (fail) throw new Error('down'); puts.push(b) } } as unknown as AccountClient
  return { puts, client, setFail: (v: boolean) => { fail = v } }
}
// WebCrypto settles on the libuv pool, so a real macrotask is needed after the fake clock moves.
const realSetTimeout = globalThis.setTimeout
const flush = () => new Promise((r) => realSetTimeout(r, 30))
const tick = async (ms: number) => { await vi.advanceTimersByTimeAsync(ms); await flush() }

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  db.store.clear(); resetAccountForTest(); await markUploaded(null)
  profile.set(null)
  settings.set({ relayUrl: 'https://elsewhere-relay.vinav.workers.dev', accountUrl: 'https://elsewhere-account.vinav.workers.dev' })
  key ??= await deriveKey('correct horse battery staple', SALT)
})
afterEach(() => vi.useRealTimers())

const signedIn = async () => {
  const a = useAccount.getState()
  await a.setSession({ session: 's', id: 'acct_1', email: 'ada@example.com' })
  await a.setSalt(b64(SALT))
  a.setKey(key)
}

describe('vault sync', () => {
  it('uploads two seconds after identity and profile both exist, then again only when something changes', async () => {
    const f = fakeClient()
    const stop = startVaultSync({ client: () => f.client, keys: async () => KEYS, now: () => 1234 })
    await signedIn()
    await tick(2100)
    expect(f.puts).toHaveLength(0)
    profile.set(ADA)
    await tick(1900)
    expect(f.puts).toHaveLength(0)
    await tick(200)
    expect(f.puts).toHaveLength(1)
    const plain = await openVault(key, f.puts[0])
    expect(plain).toEqual({ v: 1, signPriv: toHex(KEYS.signPriv), kxPriv: toHex(KEYS.kxPriv), profile: ADA, settings: { units: 'km', relayUrl: 'https://elsewhere-relay.vinav.workers.dev', accountUrl: 'https://elsewhere-account.vinav.workers.dev' } })
    expect(useAccount.getState().vaultAt).toBe(1234)
    expect(db.store.get('account:vaultAt')).toBe(1234)
    expect(vaultStatus(useAccount.getState(), ADA)).toBe('fresh')
    // Same content again: nothing goes up. A settings change outside the subset: nothing. Relay URL: one upload.
    profile.set({ ...ADA })
    settings.set({ mapId: 'x' })
    await tick(2100)
    expect(f.puts).toHaveLength(1)
    settings.set({ relayUrl: 'https://relay.example.org' })
    profile.set({ ...ADA, units: 'mi' })
    await tick(2100)
    expect(f.puts).toHaveLength(2)
    expect((await openVault(key, f.puts[1])).settings).toEqual({ units: 'mi', relayUrl: 'https://relay.example.org', accountUrl: 'https://elsewhere-account.vinav.workers.dev' })
    stop()
    profile.set(ADA)
    await tick(2100)
    expect(f.puts).toHaveLength(2)
  })
  it('without the key in memory a due upload is skipped and the vault reads as out of date until it goes up', async () => {
    const f = fakeClient()
    const stop = startVaultSync({ client: () => f.client, keys: async () => KEYS })
    await signedIn()
    useAccount.getState().setKey(null)
    profile.set(ADA)
    await tick(2100)
    expect(f.puts).toHaveLength(0)
    expect(useAccount.getState().pending).toBe(true)
    expect(vaultStatus(useAccount.getState(), ADA)).toBe('stale')
    useAccount.getState().setKey(key)
    await tick(2100)
    expect(f.puts).toHaveLength(1)
    expect(vaultStatus(useAccount.getState(), ADA)).toBe('fresh')
    stop()
  })
  it('offline or failing uploads leave the vault pending and retry on the next change', async () => {
    const f = fakeClient()
    let online = false
    const stop = startVaultSync({ client: () => f.client, keys: async () => KEYS, online: () => online })
    await signedIn()
    profile.set(ADA)
    await tick(2100)
    expect(f.puts).toHaveLength(0)
    expect(useAccount.getState().pending).toBe(true)
    online = true; f.setFail(true)
    profile.set({ ...ADA, name: 'Ada L' })
    await tick(2100)
    expect(f.puts).toHaveLength(0)
    expect(useAccount.getState().pending).toBe(true)
    f.setFail(false)
    expect(await uploadVault({ client: () => f.client, keys: async () => KEYS })).toBe(true)
    expect(f.puts).toHaveLength(1)
    expect(useAccount.getState().pending).toBe(false)
    stop()
  })
  it('after a restore the vault already holds this content, so nothing is re-uploaded until a change', async () => {
    const f = fakeClient()
    await signedIn()
    await useAccount.getState().setVaultAt(1)
    await markUploaded({ v: 1, signPriv: toHex(KEYS.signPriv), kxPriv: toHex(KEYS.kxPriv), profile: ADA, settings: { units: 'km', relayUrl: 'https://elsewhere-relay.vinav.workers.dev', accountUrl: 'https://elsewhere-account.vinav.workers.dev' } })
    expect(db.store.get('account:vaultHash')).toMatch(/^[0-9a-f]{64}$/)
    const stop = startVaultSync({ client: () => f.client, keys: async () => KEYS })
    profile.set(ADA)
    await tick(2100)
    expect(f.puts).toHaveLength(0)
    expect(vaultStatus(useAccount.getState(), ADA)).toBe('fresh')
    stop()
  })
  it('a reload with no key in memory and an unchanged profile reads as up to date, by the stored hash', async () => {
    const f = fakeClient()
    await signedIn()
    useAccount.getState().setKey(null)
    profile.set(ADA)
    await useAccount.getState().setVaultAt(1)
    await markUploaded({ v: 1, signPriv: toHex(KEYS.signPriv), kxPriv: toHex(KEYS.kxPriv), profile: ADA, settings: { units: 'km', relayUrl: 'https://elsewhere-relay.vinav.workers.dev', accountUrl: 'https://elsewhere-account.vinav.workers.dev' } })
    const stop = startVaultSync({ client: () => f.client, keys: async () => KEYS })
    await tick(2100)
    expect(f.puts).toHaveLength(0)
    expect(useAccount.getState().pending).toBe(false)
    expect(vaultStatus(useAccount.getState(), ADA)).toBe('fresh')
    // A real change, still without the key, is what makes it out of date.
    profile.set({ ...ADA, name: 'Ada L' })
    await tick(2100)
    expect(vaultStatus(useAccount.getState(), ADA)).toBe('stale')
    stop()
  })
  it('signed out there is nothing to report; signed in without a profile there is nothing to keep yet', () => {
    expect(vaultStatus({ session: null, pending: false, vaultAt: null }, ADA)).toBe('none')
    expect(vaultStatus({ session: { session: 's', id: 'a', email: 'e' }, pending: false, vaultAt: null }, null)).toBe('empty')
    expect(vaultStatus({ session: { session: 's', id: 'a', email: 'e' }, pending: false, vaultAt: null }, ADA)).toBe('stale')
  })
})
