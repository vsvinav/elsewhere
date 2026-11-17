// End to end: the real web account client and vault crypto against the real account Worker, started in-process with
// wrangler's unstable_dev and DEV_MAIL=1 so the code comes back in the response instead of a mail.
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { accountClient, AccountError } from './client'
import { deriveKey, newSalt, openVault, sealVault, type VaultPlain } from './vault'
import { generateKeys, toHex } from '../crew/keys'

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

  it('a stale session on an authed call clears the device session', async () => {
    const d = device()
    d.session = 'f'.repeat(64)
    await expect(d.client.me()).rejects.toMatchObject({ status: 401 })
    expect(d.lost).toBe(1)
    expect(d.session).toBeNull()
  })
})
