import { SELF } from 'cloudflare:test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reset } from 'cloudflare:test'
import { resetJwksForTest, setJwksFetch } from '../src/google'

const T0 = Date.UTC(2025, 10, 15, 16, 0, 0)
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T0) })
afterEach(async () => { vi.useRealTimers(); resetJwksForTest(); await reset() })

interface Finish { session: string; account: { id: string; email: string; created: number; hasVault: boolean } }
const WEB = 'web-client.apps.googleusercontent.com'
const ANDROID = 'android-client.apps.googleusercontent.com'

const b64url = (b: Uint8Array | string) => btoa(typeof b === 'string' ? b : String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const RSA = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }

/** A stand-in for Google: one RSA key, a JWKS document and a signer for ID tokens. */
async function issuer(kid = 'k1') {
  const pair = (await crypto.subtle.generateKey(RSA, true, ['sign', 'verify'])) as CryptoKeyPair
  const pub = await crypto.subtle.exportKey('jwk', pair.publicKey)
  const jwks = { keys: [{ ...pub, kid, alg: 'RS256', use: 'sig' }] }
  const sign = async (claims: Record<string, unknown>, header: Record<string, unknown> = {}) => {
    const h = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid, ...header }))
    const p = b64url(JSON.stringify(claims))
    const sig = new Uint8Array(await crypto.subtle.sign(RSA.name, pair.privateKey, new TextEncoder().encode(`${h}.${p}`)))
    return `${h}.${p}.${b64url(sig)}`
  }
  return { jwks, sign }
}
const claims = (over: Record<string, unknown> = {}) => ({ iss: 'https://accounts.google.com', aud: WEB, sub: '1234567890', email: 'Ada@Example.COM', email_verified: true, iat: T0 / 1000 - 60, exp: T0 / 1000 + 3600, ...over })

const serve = (jwks: unknown) => {
  const f = vi.fn(async (input: RequestInfo | URL) => {
    expect(String(input)).toBe('https://www.googleapis.com/oauth2/v3/certs')
    return Response.json(jwks)
  })
  setJwksFetch(f as unknown as typeof fetch)
  return f
}
const post = (path: string, body: unknown, ip = '203.0.113.1') =>
  SELF.fetch(`http://localhost${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip } })
const google = (idToken: unknown, ip?: string) => post('/auth/google', { idToken }, ip)

describe('POST /auth/google', () => {
  it('a valid ID token signs in: same response shape as /auth/finish, email normalised, JWKS cached for an hour', async () => {
    const g = await issuer()
    const fetched = serve(g.jwks)
    const r = await google(await g.sign(claims()))
    expect(r.status).toBe(200)
    const b = (await r.json()) as Finish
    expect(b.session).toMatch(/^[0-9a-f]{64}$/)
    expect(b.account).toEqual({ id: expect.stringMatching(/^acct_[0-9a-f]{16}$/), email: 'ada@example.com', created: T0, hasVault: false })
    expect(fetched).toHaveBeenCalledTimes(1)
    const me = await SELF.fetch('http://localhost/me', { headers: { authorization: `Bearer ${b.session}` } })
    expect(me.status).toBe(200)

    vi.setSystemTime(T0 + 30 * 60_000)
    expect((await google(await g.sign(claims({ aud: ANDROID })), '203.0.113.2'))).toHaveProperty('status', 200)
    expect(fetched).toHaveBeenCalledTimes(1)
    vi.setSystemTime(T0 + 61 * 60_000)
    expect((await google(await g.sign(claims({ exp: T0 / 1000 + 7200 })), '203.0.113.3'))).toHaveProperty('status', 200)
    expect(fetched).toHaveBeenCalledTimes(2)
  })
  it('lands on the same account as an email-link login for that address', async () => {
    const s = await post('/auth/start', { email: 'bo@example.com' })
    const { dev } = (await s.json()) as { dev: { code: string } }
    const fin = (await (await post('/auth/finish', { email: 'bo@example.com', code: dev.code })).json()) as Finish
    const g = await issuer()
    serve(g.jwks)
    const r = await google(await g.sign(claims({ email: 'BO@example.com' })))
    expect(r.status).toBe(200)
    const b = (await r.json()) as Finish
    expect(b.account.id).toBe(fin.account.id)
    expect(b.session).not.toBe(fin.session)
  })
  it('refuses a wrong audience, a wrong issuer, an expired token, an unverified email, a bad signature and junk', async () => {
    const g = await issuer()
    const other = await issuer('k2')
    serve(g.jwks)
    const bad: Array<[string, string]> = [
      ['aud', await g.sign(claims({ aud: 'someone-else.apps.googleusercontent.com' }))],
      ['iss', await g.sign(claims({ iss: 'https://evil.example' }))],
      ['exp', await g.sign(claims({ exp: T0 / 1000 - 1 }))],
      ['email_verified', await g.sign(claims({ email_verified: false }))],
      ['no email', await g.sign(claims({ email: undefined }))],
      ['signature', await other.sign(claims(), { kid: 'k1' })],
      ['unknown kid', await other.sign(claims())],
      ['alg none', `${b64url(JSON.stringify({ alg: 'none', kid: 'k1' }))}.${b64url(JSON.stringify(claims()))}.`],
      ['junk', 'not.a.jwt'],
    ]
    for (const [why, token] of bad) {
      const r = await google(token, `10.3.0.${bad.findIndex(([w]) => w === why)}`)
      expect(r.status, why).toBe(401)
      expect(await r.json(), why).toEqual({ error: 'unauthorized' })
    }
    expect((await google(42)).status).toBe(400)
    expect((await post('/auth/google', {})).status).toBe(400)
    // The issuer without the scheme is Google too.
    expect((await google(await g.sign(claims({ iss: 'accounts.google.com' })))).status).toBe(200)
  })
  it('counts against the finish limiter: the twenty-first from one IP in ten minutes is refused', async () => {
    const g = await issuer()
    serve(g.jwks)
    for (let i = 0; i < 20; i++) expect((await google(await g.sign(claims({ email: `u${i}@example.com` })), '10.4.0.1')).status).toBe(200)
    const r = await google(await g.sign(claims()), '10.4.0.1')
    expect(r.status).toBe(429)
    expect(await r.json()).toEqual({ error: 'slow down' })
    // And per address: ten tries for one email, whatever the IP.
    for (let i = 0; i < 10; i++) await google(await g.sign(claims({ email: 'cy@example.com' })), `10.5.0.${i}`)
    expect((await google(await g.sign(claims({ email: 'cy@example.com' })), '10.5.0.99')).status).toBe(429)
  })
  it('a kid missing from the cached keys fetches them once more before giving up', async () => {
    const old = await issuer('k1'), fresh = await issuer('k2')
    const fetched = serve(old.jwks)
    expect((await google(await old.sign(claims()))).status).toBe(200)
    // Google rotated: the token is signed with a key the cache has not seen.
    fetched.mockImplementation(async () => Response.json(fresh.jwks))
    expect((await google(await fresh.sign(claims()), '203.0.113.2'))).toHaveProperty('status', 200)
    expect(fetched).toHaveBeenCalledTimes(2)
    // A kid nobody has refetches once, then fails; it does not hammer Google.
    const stranger = await issuer('k9')
    expect((await google(await stranger.sign(claims()), '203.0.113.3')).status).toBe(401)
    expect(fetched).toHaveBeenCalledTimes(3)
  })
  it('keeps using stale keys when Google cannot be reached', async () => {
    const g = await issuer()
    const fetched = serve(g.jwks)
    expect((await google(await g.sign(claims()))).status).toBe(200)
    vi.setSystemTime(T0 + 2 * 3600_000)
    fetched.mockImplementation(async () => { throw new Error('offline') })
    expect((await google(await g.sign(claims({ exp: T0 / 1000 + 3 * 3600 })), '203.0.113.2')).status).toBe(200)
    expect(fetched).toHaveBeenCalledTimes(2)
  })
  it('answers 401 when the JWKS cannot be fetched', async () => {
    const g = await issuer()
    setJwksFetch((async () => new Response('down', { status: 503 })) as unknown as typeof fetch)
    expect((await google(await g.sign(claims()))).status).toBe(401)
  })
})
