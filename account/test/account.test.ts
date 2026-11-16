import { SELF, env } from 'cloudflare:test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'

const T0 = Date.UTC(2025, 10, 15, 16, 0, 0)
const HOUR = 3600_000
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T0) })
afterEach(() => vi.useRealTimers())

type Json = Record<string, unknown>
interface Dev { code: string; token: string }
interface Finish { session: string; account: { id: string; email: string; created: number; hasVault: boolean } }

const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  SELF.fetch(`https://account${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.1', ...headers } })
const authed = (session: string, method: string, path: string, body?: unknown) => call(method, path, body, { authorization: `Bearer ${session}` })

async function start(email: string, ip = '203.0.113.1'): Promise<Dev> {
  const r = await call('POST', '/auth/start', { email }, { 'cf-connecting-ip': ip })
  expect(r.status).toBe(200)
  const b = (await r.json()) as { ok: boolean; dev: Dev }
  expect(b.ok).toBe(true)
  return b.dev
}
async function signIn(email: string): Promise<Finish> {
  const dev = await start(email)
  const r = await call('POST', '/auth/finish', { email, code: dev.code })
  expect(r.status).toBe(200)
  return (await r.json()) as Finish
}
const vault = { v: 1, salt: 'ABEiM0RVZneImaq7zN3u/w==', iv: 'Dw4NDAsKCQgHBgUE', ct: 'G0e66PVIthGHTpXPjBk29/2Nipg94l6I4g==' }

describe('health and CORS', () => {
  it('GET /health answers ok', async () => {
    const r = await SELF.fetch('https://account/health')
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true })
  })
  it('answers preflights and marks every response for cross-origin browsers', async () => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type, Authorization', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'access-control-max-age': '86400' }
    for (const path of ['/auth/start', '/me', '/vault', '/nowhere']) {
      const pre = await SELF.fetch(`https://account${path}`, { method: 'OPTIONS', headers: { Origin: 'https://elsewhere.app', 'Access-Control-Request-Method': 'PUT' } })
      expect(pre.status).toBe(204)
      for (const [k, v] of Object.entries(cors)) expect(pre.headers.get(k)).toBe(v)
    }
    const denied = await SELF.fetch('https://account/me')
    expect(denied.status).toBe(401)
    for (const [k, v] of Object.entries(cors)) expect(denied.headers.get(k)).toBe(v)
    expect((await SELF.fetch('https://account/nowhere')).status).toBe(404)
  })
})

describe('auth', () => {
  it('start → finish by code creates an account and a session; the same email logs in again to the same id', async () => {
    const dev = await start('  Ada@Example.COM ')
    expect(dev.code).toMatch(/^\d{6}$/)
    expect(dev.token).toMatch(/^[0-9a-f]{64}$/)
    const r = await call('POST', '/auth/finish', { email: 'ada@example.com', code: dev.code })
    expect(r.status).toBe(200)
    const b = (await r.json()) as Finish
    expect(b.session).toMatch(/^[0-9a-f]{64}$/)
    expect(b.account).toEqual({ id: expect.stringMatching(/^acct_[0-9a-f]{16}$/), email: 'ada@example.com', created: T0, hasVault: false })
    // The code is single use.
    expect((await call('POST', '/auth/finish', { email: 'ada@example.com', code: dev.code })).status).toBe(400)
    vi.setSystemTime(T0 + HOUR)
    const again = await signIn('ADA@example.com')
    expect(again.account.id).toBe(b.account.id)
    expect(again.account.created).toBe(T0)
    expect(again.session).not.toBe(b.session)
  })
  it('finishes by token from the mail link', async () => {
    const dev = await start('bo@example.com')
    const r = await call('POST', '/auth/finish', { token: dev.token })
    expect(r.status).toBe(200)
    expect(((await r.json()) as Finish).account.email).toBe('bo@example.com')
    const gone = await call('POST', '/auth/finish', { token: dev.token })
    expect(gone.status).toBe(400)
    expect(await gone.json()).toEqual({ error: 'expired' })
  })
  it('rejects a bad email and a malformed body', async () => {
    for (const email of ['', 'nope', 'a@b', 'a b@c.d', `${'x'.repeat(250)}@e.com`]) {
      const r = await call('POST', '/auth/start', { email })
      expect(r.status, email).toBe(400)
    }
    expect((await SELF.fetch('https://account/auth/start', { method: 'POST', body: '{', headers: { 'cf-connecting-ip': '1.1.1.1' } })).status).toBe(400)
    expect((await call('POST', '/auth/finish', {})).status).toBe(400)
  })
  it('a wrong code is 401 and the fifth wrong one kills the token', async () => {
    const dev = await start('cy@example.com')
    const wrong = dev.code === '000000' ? '111111' : '000000'
    for (let i = 0; i < 4; i++) {
      const r = await call('POST', '/auth/finish', { email: 'cy@example.com', code: wrong })
      expect(r.status).toBe(401)
      expect(await r.json()).toEqual({ error: 'wrong code' })
    }
    const fifth = await call('POST', '/auth/finish', { email: 'cy@example.com', code: wrong })
    expect(fifth.status).toBe(400)
    expect(await fifth.json()).toEqual({ error: 'expired' })
    expect((await call('POST', '/auth/finish', { email: 'cy@example.com', code: dev.code })).status).toBe(400)
  })
  it('a token older than ten minutes has expired; a new start replaces the old code', async () => {
    const dev = await start('dee@example.com')
    vi.setSystemTime(T0 + 601_000)
    const r = await call('POST', '/auth/finish', { token: dev.token })
    expect(r.status).toBe(400)
    expect(await r.json()).toEqual({ error: 'expired' })
    expect((await call('POST', '/auth/finish', { email: 'dee@example.com', code: dev.code })).status).toBe(400)
    const first = await start('eve@example.com')
    const second = await start('eve@example.com')
    // The email now answers to the second code; the first still works through its link token.
    expect((await call('POST', '/auth/finish', { email: 'eve@example.com', code: first.code })).status).toBe(first.code === second.code ? 200 : 401)
    expect((await call('POST', '/auth/finish', { token: first.token })).status).toBe(200)
    expect((await call('POST', '/auth/finish', { email: 'eve@example.com', code: second.code })).status).toBe(200)
  })
  it('rate limits the sixth start per email and the twenty-first per IP in an hour', async () => {
    for (let i = 0; i < 5; i++) await start('fay@example.com', `10.0.0.${i}`)
    const r = await call('POST', '/auth/start', { email: 'fay@example.com' }, { 'cf-connecting-ip': '10.0.0.9' })
    expect(r.status).toBe(429)
    expect(await r.json()).toEqual({ error: 'slow down' })
    // Even a malformed email counts against the IP, so the limiter cannot be probed for free.
    expect((await call('POST', '/auth/start', { email: 'nope' }, { 'cf-connecting-ip': '10.0.0.9' })).status).toBe(400)
    for (let i = 0; i < 20; i++) await start(`u${i}@example.com`, '10.0.0.7')
    const ip = await call('POST', '/auth/start', { email: 'u99@example.com' }, { 'cf-connecting-ip': '10.0.0.7' })
    expect(ip.status).toBe(429)
    vi.setSystemTime(T0 + HOUR)
    await start('fay@example.com', '10.0.0.7')
  })
  it('five wrong guesses fired at once still kill the token: the tries are counted atomically', async () => {
    const dev = await start('max@example.com')
    const wrong = dev.code === '000000' ? '111111' : '000000'
    const rs = await Promise.all(Array.from({ length: 5 }, (_, i) => call('POST', '/auth/finish', { email: 'max@example.com', code: wrong }, { 'cf-connecting-ip': `10.1.0.${i}` })))
    expect(rs.map((r) => r.status).sort()).toEqual([400, 401, 401, 401, 401])
    const right = await call('POST', '/auth/finish', { email: 'max@example.com', code: dev.code })
    expect(right.status).toBe(400)
    expect(await right.json()).toEqual({ error: 'expired' })
    expect((await call('POST', '/auth/finish', { token: dev.token })).status).toBe(400)
  })
  it('rate limits finishes: the eleventh per email and the twenty-first per IP in ten minutes', async () => {
    const dev = await start('ned@example.com')
    const wrong = dev.code === '000000' ? '111111' : '000000'
    // Ten finishes for one email from different addresses; the eleventh is refused before the code is even looked at.
    for (let i = 0; i < 10; i++) expect((await call('POST', '/auth/finish', { email: 'ned@example.com', code: wrong }, { 'cf-connecting-ip': `10.2.0.${i}` })).status).toBeLessThan(429)
    const r = await call('POST', '/auth/finish', { email: 'ned@example.com', code: dev.code }, { 'cf-connecting-ip': '10.2.0.99' })
    expect(r.status).toBe(429)
    expect(await r.json()).toEqual({ error: 'slow down' })
    for (let i = 0; i < 20; i++) expect((await call('POST', '/auth/finish', { token: 'f'.repeat(64) }, { 'cf-connecting-ip': '10.2.1.1' })).status).toBe(400)
    expect((await call('POST', '/auth/finish', { token: 'f'.repeat(64) }, { 'cf-connecting-ip': '10.2.1.1' })).status).toBe(429)
    expect((await call('POST', '/auth/finish', { token: 'f'.repeat(64) }, { 'cf-connecting-ip': '10.2.1.2' })).status).toBe(400)
    vi.setSystemTime(T0 + 601_000)
    expect((await call('POST', '/auth/finish', { token: 'f'.repeat(64) }, { 'cf-connecting-ip': '10.2.1.1' })).status).toBe(400)
  })
  it('thirty starts at once from one IP let exactly twenty through', async () => {
    const rs = await Promise.all(Array.from({ length: 30 }, (_, i) => call('POST', '/auth/start', { email: `p${i}@example.com` }, { 'cf-connecting-ip': '10.3.0.1' })))
    expect(rs.filter((r) => r.status === 200)).toHaveLength(20)
    expect(rs.filter((r) => r.status === 429)).toHaveLength(10)
  })
  it('peek names the masked address behind a live token and nothing for a dead one', async () => {
    const dev = await start('olive.p@example.com')
    const r = await call('GET', `/auth/peek?token=${dev.token}`)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ email: 'o***@example.com' })
    expect((await call('GET', '/auth/peek?token=nope')).status).toBe(400)
    expect((await call('GET', `/auth/peek?token=${'e'.repeat(64)}`)).status).toBe(400)
    expect((await call('POST', '/auth/finish', { token: dev.token })).status).toBe(200)
    const gone = await call('GET', `/auth/peek?token=${dev.token}`)
    expect(gone.status).toBe(400)
    expect(await gone.json()).toEqual({ error: 'expired' })
  })
  it('does not leak the code when DEV_MAIL is unset, and still answers ok when mail fails', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }))
    const req = new Request('https://account/auth/start', { method: 'POST', body: JSON.stringify({ email: 'gil@example.com' }), headers: { 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4' } })
    const r = await worker.fetch(req, { ...env, DEV_MAIL: undefined, RESEND_KEY: 'k', MAIL_FROM: 'Elsewhere <hello@elsewhere.app>', LINK_BASE: 'https://x.test/v3/' })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    const mail = JSON.parse(String(init.body)) as Json
    expect(mail.to).toEqual(['gil@example.com'])
    expect(mail.from).toBe('Elsewhere <hello@elsewhere.app>')
    expect(mail.subject).toMatch(/^Your Elsewhere code: \d{3} \d{3}$/)
    expect(String(mail.text)).toContain('https://x.test/v3/#auth=')
    fetchSpy.mockRestore()
  })
})

describe('authenticated routes', () => {
  it('/me reads the account; a bad or missing session is 401', async () => {
    const s = await signIn('hal@example.com')
    const r = await authed(s.session, 'GET', '/me')
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ id: s.account.id, email: 'hal@example.com', created: T0, hasVault: false })
    expect((await authed('0'.repeat(64), 'GET', '/me')).status).toBe(401)
    expect((await call('GET', '/me', undefined, { authorization: 'Basic abc' })).status).toBe(401)
  })
  it('a session expires after ninety days', async () => {
    const s = await signIn('ida@example.com')
    vi.setSystemTime(T0 + 89 * 24 * HOUR)
    expect((await authed(s.session, 'GET', '/me')).status).toBe(200)
    vi.setSystemTime(T0 + 91 * 24 * HOUR)
    expect((await authed(s.session, 'GET', '/me')).status).toBe(401)
  })
  it('vault round trip: 404 before, 204 on put, same body back, 413 past 64 KB, 400 on a malformed body', async () => {
    const s = await signIn('jo@example.com')
    expect((await authed(s.session, 'GET', '/vault')).status).toBe(404)
    expect((await authed(s.session, 'PUT', '/vault', vault)).status).toBe(204)
    const r = await authed(s.session, 'GET', '/vault')
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual(vault)
    expect(((await (await authed(s.session, 'GET', '/me')).json()) as Json).hasVault).toBe(true)
    expect((await authed(s.session, 'PUT', '/vault', { ...vault, ct: 'A'.repeat(66_000) })).status).toBe(413)
    for (const bad of [{ ...vault, v: 2 }, { salt: vault.salt, iv: vault.iv }, { ...vault, ct: 'not base64!' }, []]) {
      expect((await authed(s.session, 'PUT', '/vault', bad)).status).toBe(400)
    }
  })
  it('logout invalidates the session only; the account stays', async () => {
    const s = await signIn('kim@example.com')
    expect((await authed(s.session, 'DELETE', '/session')).status).toBe(204)
    expect((await authed(s.session, 'GET', '/me')).status).toBe(401)
    const again = await signIn('kim@example.com')
    expect(again.account.id).toBe(s.account.id)
  })
  it('deleting the account takes the vault, the email and the session with it', async () => {
    const s = await signIn('lou@example.com')
    expect((await authed(s.session, 'PUT', '/vault', vault)).status).toBe(204)
    expect((await authed(s.session, 'DELETE', '/me')).status).toBe(204)
    expect((await authed(s.session, 'GET', '/me')).status).toBe(401)
    expect(await env.ACCOUNTS.get(`acct:${s.account.id}`)).toBeNull()
    expect(await env.ACCOUNTS.get(`vault:${s.account.id}`)).toBeNull()
    expect(await env.ACCOUNTS.get('email:lou@example.com')).toBeNull()
    vi.setSystemTime(T0 + HOUR)
    const fresh = await signIn('lou@example.com')
    expect(fresh.account.id).not.toBe(s.account.id)
    expect(fresh.account.hasVault).toBe(false)
  })
})
