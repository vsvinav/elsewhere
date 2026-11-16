import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ store: new Map<string, unknown>() }))
vi.mock('../ingest/db', () => ({ kv: { get: async (k: string) => db.store.get(k), set: async (k: string, v: unknown) => { db.store.set(k, v) }, del: async (k: string) => { db.store.delete(k) } } }))
vi.hoisted(() => {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) })
})

import { AccountError, accountClient, api, deleteAccount, logOut, messageOf } from './client'
import { ACCOUNT_KV, resetAccountForTest, useAccount } from './store'

type Call = { url: string; init: RequestInit }
function fakeFetch(route: (c: Call) => Response | Promise<Response>) {
  const calls: Call[] = []
  const fn = (async (url: string, init: RequestInit = {}) => { const c = { url, init }; calls.push(c); return route(c) }) as unknown as typeof fetch
  return { fn, calls }
}
const vault = { v: 1 as const, salt: 'c2FsdA==', iv: 'aXY=', ct: 'Y3Q=' }

beforeEach(() => { db.store.clear(); resetAccountForTest() })

describe('account client', () => {
  it('start and finish post JSON and return the bodies', async () => {
    const f = fakeFetch(({ url }) => Response.json(url.endsWith('/auth/start') ? { ok: true, dev: { code: '123456' } } : { session: 's1', account: { id: 'acct_1', email: 'a@b.co', created: 1, hasVault: false } }))
    const c = accountClient('https://acct.test/', { fetchFn: f.fn })
    expect(await c.start('a@b.co')).toEqual({ ok: true, dev: { code: '123456' } })
    expect(f.calls[0].url).toBe('https://acct.test/auth/start')
    expect(f.calls[0].init.method).toBe('POST')
    expect(JSON.parse(String(f.calls[0].init.body))).toEqual({ email: 'a@b.co' })
    const fin = await c.finish({ email: 'a@b.co', code: '123456' })
    expect(fin.session).toBe('s1')
    expect(JSON.parse(String(f.calls[1].init.body))).toEqual({ email: 'a@b.co', code: '123456' })
    await c.finish({ token: 'tok' })
    expect(JSON.parse(String(f.calls[2].init.body))).toEqual({ token: 'tok' })
  })
  it('peek asks for the masked address behind a token', async () => {
    const f = fakeFetch(() => Response.json({ email: 'a***@b.co' }))
    expect(await accountClient('https://acct.test', { fetchFn: f.fn }).peek('ab'.repeat(32))).toEqual({ email: 'a***@b.co' })
    expect(f.calls[0].url).toBe(`https://acct.test/auth/peek?token=${'ab'.repeat(32)}`)
    expect(f.calls[0].init.method).toBe('GET')
  })
  it('surfaces the service error code and status, and maps them to the screen copy', async () => {
    const f = fakeFetch(() => Response.json({ error: 'slow down' }, { status: 429 }))
    const c = accountClient('https://acct.test', { fetchFn: f.fn })
    const err = await c.start('a@b.co').catch((e) => e as AccountError)
    expect(err).toBeInstanceOf(AccountError)
    expect(err).toMatchObject({ status: 429, code: 'slow down' })
    expect(messageOf(err)).toBe('Too many tries. Give it an hour.')
    expect(messageOf(new AccountError(401, 'wrong code'))).toBe("That code isn't right.")
    expect(messageOf(new AccountError(400, 'expired'))).toBe('That code expired. Send a new one.')
    expect(messageOf(new AccountError(500, 'boom'))).toBe('Something went wrong. Try again.')
    const down = accountClient('https://acct.test', { fetchFn: (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch })
    const e2 = await down.start('a@b.co').catch((e) => e as AccountError)
    expect(e2).toMatchObject({ status: 0, code: 'network' })
    expect(messageOf(e2)).toBe("Couldn't reach the account service. Check your connection.")
  })
  it('authenticated calls carry the bearer session; the vault round-trips and 404 reads as no vault', async () => {
    const f = fakeFetch(({ url, init }) => {
      if (init.method === 'PUT') return new Response(null, { status: 204 })
      if (url.endsWith('/vault')) return Response.json(vault)
      if (url.endsWith('/me')) return Response.json({ id: 'acct_1', email: 'a@b.co', created: 1, hasVault: true })
      return new Response(null, { status: 204 })
    })
    const c = accountClient('https://acct.test', { fetchFn: f.fn, session: () => 'sess' })
    expect(await c.me()).toEqual({ id: 'acct_1', email: 'a@b.co', created: 1, hasVault: true })
    expect((f.calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer sess')
    await c.putVault(vault)
    expect(JSON.parse(String(f.calls[1].init.body))).toEqual(vault)
    expect(await c.getVault()).toEqual(vault)
    await c.logout(); await c.deleteMe()
    expect(f.calls.map((x) => `${x.init.method} ${x.url.slice(17)}`)).toEqual(['GET /me', 'PUT /vault', 'GET /vault', 'DELETE /session', 'DELETE /me'])
    const empty = accountClient('https://acct.test', { fetchFn: fakeFetch(() => Response.json({ error: 'not found' }, { status: 404 })).fn, session: () => 'sess' })
    expect(await empty.getVault()).toBeNull()
  })
  it('without a session an authenticated call fails locally without touching the network', async () => {
    const f = fakeFetch(() => Response.json({}))
    const c = accountClient('https://acct.test', { fetchFn: f.fn, session: () => null })
    await expect(c.me()).rejects.toMatchObject({ status: 401 })
    expect(f.calls).toHaveLength(0)
  })
  it('a 401 on an authenticated call signs the device out', async () => {
    await useAccount.getState().setSession({ session: 'old', id: 'acct_1', email: 'a@b.co' })
    await useAccount.getState().setSalt('c2FsdA==')
    useAccount.getState().setKey(new Uint8Array(32))
    const f = fakeFetch(() => Response.json({ error: 'unauthorized' }, { status: 401 }))
    await expect(api(f.fn).me()).rejects.toMatchObject({ status: 401 })
    expect(useAccount.getState().session).toBeNull()
    expect(useAccount.getState().key).toBeNull()
    expect(useAccount.getState().salt).toBeNull()
    await Promise.resolve()
    expect(db.store.get(ACCOUNT_KV.session)).toBeUndefined()
    // A 401 on /auth/finish is a wrong code, not a lost session.
    await useAccount.getState().setSession({ session: 's', id: 'acct_1', email: 'a@b.co' })
    await expect(api(fakeFetch(() => Response.json({ error: 'wrong code' }, { status: 401 })).fn).finish({ email: 'a@b.co', code: '000000' })).rejects.toMatchObject({ code: 'wrong code' })
    expect(useAccount.getState().session?.session).toBe('s')
  })
  it('logOut tells the service and forgets the session even when the service refuses; deleteAccount needs the service to agree', async () => {
    await useAccount.getState().setSession({ session: 's', id: 'acct_1', email: 'a@b.co' })
    const f = fakeFetch(() => Response.json({ error: 'unauthorized' }, { status: 401 }))
    await logOut(api(f.fn))
    expect(f.calls[0].init.method).toBe('DELETE')
    expect(useAccount.getState().session).toBeNull()
    await useAccount.getState().setSession({ session: 's', id: 'acct_1', email: 'a@b.co' })
    await expect(deleteAccount(api(fakeFetch(() => Response.json({ error: 'nope' }, { status: 500 })).fn))).rejects.toMatchObject({ status: 500 })
    expect(useAccount.getState().session?.session).toBe('s')
    await deleteAccount(api(fakeFetch(() => new Response(null, { status: 204 })).fn))
    expect(useAccount.getState().session).toBeNull()
  })
})

describe('account store', () => {
  it('loads what the device remembers under the agreed keys and tolerates junk', async () => {
    db.store.set('account:session', { session: 's', id: 'acct_1', email: 'a@b.co' })
    db.store.set('account:salt', 'c2FsdA==')
    db.store.set('account:vaultAt', 1700000000000)
    db.store.set('welcomed', true)
    await useAccount.getState().load()
    expect(useAccount.getState()).toMatchObject({ loaded: true, session: { session: 's', id: 'acct_1', email: 'a@b.co' }, salt: 'c2FsdA==', vaultAt: 1700000000000, welcomed: true, key: null })
    db.store.set('account:session', 'garbage'); db.store.set('welcomed', 'yes')
    await useAccount.getState().load()
    expect(useAccount.getState()).toMatchObject({ session: null, welcomed: false })
  })
  it('writes through to storage and clears keys on null', async () => {
    const a = useAccount.getState()
    await a.setWelcomed(true)
    await a.setSession({ session: 's', id: 'acct_1', email: 'a@b.co' })
    await a.setSalt('c2FsdA=='); await a.setVaultAt(5)
    expect([...db.store.keys()].sort()).toEqual(['account:salt', 'account:session', 'account:vaultAt', 'welcomed'])
    await a.setVaultAt(null)
    expect(db.store.has('account:vaultAt')).toBe(false)
    await a.signOut()
    expect([...db.store.keys()]).toEqual(['welcomed'])
  })
})
