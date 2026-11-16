// The account service: email magic codes, 90-day sessions and one client-encrypted recovery vault per account.
// It holds no plaintext beyond the email address; the vault is bytes it cannot read.

const json = (body: unknown, status = 200) => Response.json(body, { status })
const fail = (error: string, status: number) => json({ error }, status)
const noContent = () => new Response(null, { status: 204 })

/** Browsers on any origin may talk to the service; the bearer session, not the origin, is what it trusts. */
export const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Max-Age': '86400',
}
function withCors(res: Response): Response {
  if (res.status === 101) return res
  const out = new Response(res.body, res)
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v)
  return out
}
const ipOf = (req: Request) => req.headers.get('cf-connecting-ip') ?? 'unknown'

export const CODE_TTL_S = 600
export const SESSION_TTL_S = 90 * 24 * 3600
export const MAX_TRIES = 5
export const STARTS_PER_EMAIL = 5
export const STARTS_PER_IP = 20
export const VAULT_MAX_BYTES = 64 * 1024
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/

interface Token { email: string; code: string; tries: number; exp: number }
interface Account { email: string; created: number }
interface Session { acct: string; exp: number }
interface Vault { v: 1; salt: string; iv: string; ct: string }

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
const randomHex = (bytes: number) => hex(crypto.getRandomValues(new Uint8Array(bytes)))
/** Six digits, each drawn from a byte with rejection so the distribution is flat. */
function randomCode(): string {
  let out = ''
  while (out.length < 6) {
    const [b] = crypto.getRandomValues(new Uint8Array(1))
    if (b < 250) out += String(b % 10)
  }
  return out
}
function sameCode(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const x = enc.encode(a), y = enc.encode(b)
  if (x.byteLength !== y.byteLength) return false
  return crypto.subtle.timingSafeEqual(x, y)
}
export const normalizeEmail = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null
  const e = raw.trim().toLowerCase()
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null
}

async function parseBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b: unknown = await req.json()
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null
  } catch { return null }
}

/** Counts per hour bucket; the bucket key rolls over on the hour, and KV forgets it soon after. */
async function bump(env: Env, key: string, now: number): Promise<number> {
  const k = `rl:${key}:${Math.floor(now / 3600_000)}`
  const n = Number((await env.ACCOUNTS.get(k)) ?? '0') + 1
  await env.ACCOUNTS.put(k, String(n), { expirationTtl: 3600 })
  return n
}

async function sendMail(env: Env, to: string, code: string, token: string): Promise<void> {
  const pretty = `${code.slice(0, 3)} ${code.slice(3)}`
  const link = `${env.LINK_BASE ?? ''}#auth=${token}`
  const text = `Your Elsewhere code is ${pretty}. It works for ten minutes.\n\nOr open this link on the device you are signing in on:\n${link}\n\nIf you did not ask for this, ignore this mail.`
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_KEY ?? ''}` },
      body: JSON.stringify({ from: env.MAIL_FROM ?? '', to: [to], subject: `Your Elsewhere code: ${pretty}`, text }),
    })
    if (!r.ok) console.error('mail failed', r.status, await r.text().catch(() => ''))
  } catch (e) { console.error('mail failed', e) }
}

async function authStart(req: Request, env: Env, now: number): Promise<Response> {
  const body = await parseBody(req)
  const email = normalizeEmail(body?.email)
  // Counters move before any other check, so the endpoint cannot be used to tell addresses apart.
  const ipHits = await bump(env, `ip:${ipOf(req)}`, now)
  const emailHits = email ? await bump(env, `email:${email}`, now) : 0
  if (ipHits > STARTS_PER_IP || emailHits > STARTS_PER_EMAIL) return fail('slow down', 429)
  if (!email) return fail('bad email', 400)
  const code = randomCode(), token = randomHex(32)
  const tok: Token = { email, code, tries: 0, exp: now + CODE_TTL_S * 1000 }
  await env.ACCOUNTS.put(`tok:${token}`, JSON.stringify(tok), { expirationTtl: CODE_TTL_S })
  await env.ACCOUNTS.put(`start:${email}`, token, { expirationTtl: CODE_TTL_S })
  if (env.DEV_MAIL === '1') return json({ ok: true, dev: { code, token } })
  await sendMail(env, email, code, token)
  return json({ ok: true })
}

async function authFinish(req: Request, env: Env, now: number): Promise<Response> {
  const body = await parseBody(req)
  if (!body) return fail('bad request', 400)
  let token: string | null = null
  let code: string | null = null
  if (typeof body.token === 'string') token = body.token
  else {
    const email = normalizeEmail(body.email)
    if (!email || typeof body.code !== 'string') return fail('bad request', 400)
    token = await env.ACCOUNTS.get(`start:${email}`)
    code = body.code.replace(/\s+/g, '')
  }
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return fail('expired', 400)
  const tokKey = `tok:${token}`
  const tok = await env.ACCOUNTS.get<Token>(tokKey, 'json')
  if (!tok || tok.exp <= now) return fail('expired', 400)
  if (code !== null && !sameCode(code, tok.code)) {
    tok.tries++
    if (tok.tries >= MAX_TRIES) { await env.ACCOUNTS.delete(tokKey); return fail('expired', 400) }
    await env.ACCOUNTS.put(tokKey, JSON.stringify(tok), { expirationTtl: Math.max(60, Math.ceil((tok.exp - now) / 1000)) })
    return fail('wrong code', 401)
  }
  await env.ACCOUNTS.delete(tokKey)
  // A newer start for the same address owns `start:`; only our own pointer is cleared.
  if ((await env.ACCOUNTS.get(`start:${tok.email}`)) === token) await env.ACCOUNTS.delete(`start:${tok.email}`)

  let id = await env.ACCOUNTS.get(`email:${tok.email}`)
  let acct = id ? await env.ACCOUNTS.get<Account>(`acct:${id}`, 'json') : null
  if (!id || !acct) {
    id = `acct_${randomHex(8)}`
    acct = { email: tok.email, created: now }
    await env.ACCOUNTS.put(`acct:${id}`, JSON.stringify(acct))
    await env.ACCOUNTS.put(`email:${tok.email}`, id)
  }
  const session = randomHex(32)
  const ses: Session = { acct: id, exp: now + SESSION_TTL_S * 1000 }
  await env.ACCOUNTS.put(`ses:${session}`, JSON.stringify(ses), { expirationTtl: SESSION_TTL_S })
  return json({ session, account: await describe(env, id, acct) })
}

const describe = async (env: Env, id: string, acct: Account) => ({ id, email: acct.email, created: acct.created, hasVault: (await env.ACCOUNTS.get(`vault:${id}`)) !== null })

async function sessionOf(req: Request, env: Env, now: number): Promise<{ token: string; acct: string } | null> {
  const m = /^Bearer\s+([0-9a-f]{64})$/i.exec(req.headers.get('authorization') ?? '')
  if (!m) return null
  const ses = await env.ACCOUNTS.get<Session>(`ses:${m[1]}`, 'json')
  return ses && ses.exp > now ? { token: m[1], acct: ses.acct } : null
}

function parseVault(text: string): Vault | null {
  let b: unknown
  try { b = JSON.parse(text) } catch { return null }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null
  const v = b as Record<string, unknown>
  if (v.v !== 1) return null
  for (const k of ['salt', 'iv', 'ct'] as const) if (typeof v[k] !== 'string' || !B64_RE.test(v[k] as string)) return null
  return { v: 1, salt: v.salt as string, iv: v.iv as string, ct: v.ct as string }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }))
    return withCors(await handle(req, env))
  },
} satisfies ExportedHandler<Env>

async function handle(req: Request, env: Env): Promise<Response> {
  const path = new URL(req.url).pathname
  const now = Date.now()
  if (path === '/health' && req.method === 'GET') return json({ ok: true })
  if (path === '/auth/start' && req.method === 'POST') return authStart(req, env, now)
  if (path === '/auth/finish' && req.method === 'POST') return authFinish(req, env, now)

  const route = `${req.method} ${path}`
  if (!['GET /me', 'DELETE /me', 'DELETE /session', 'PUT /vault', 'GET /vault'].includes(route)) return fail('not found', 404)
  const ses = await sessionOf(req, env, now)
  if (!ses) return fail('unauthorized', 401)
  const acct = await env.ACCOUNTS.get<Account>(`acct:${ses.acct}`, 'json')
  if (!acct) { await env.ACCOUNTS.delete(`ses:${ses.token}`); return fail('unauthorized', 401) }

  if (path === '/me' && req.method === 'GET') return json(await describe(env, ses.acct, acct))
  if (path === '/session' && req.method === 'DELETE') { await env.ACCOUNTS.delete(`ses:${ses.token}`); return noContent() }
  if (path === '/vault' && req.method === 'PUT') {
    const text = await req.text()
    if (new TextEncoder().encode(text).byteLength > VAULT_MAX_BYTES) return fail('too large', 413)
    const vault = parseVault(text)
    if (!vault) return fail('bad vault', 400)
    await env.ACCOUNTS.put(`vault:${ses.acct}`, JSON.stringify(vault))
    return noContent()
  }
  if (path === '/vault' && req.method === 'GET') {
    const v = await env.ACCOUNTS.get(`vault:${ses.acct}`)
    return v === null ? fail('not found', 404) : new Response(v, { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (path === '/me' && req.method === 'DELETE') {
    await Promise.all([env.ACCOUNTS.delete(`vault:${ses.acct}`), env.ACCOUNTS.delete(`acct:${ses.acct}`), env.ACCOUNTS.delete(`email:${acct.email}`), env.ACCOUNTS.delete(`ses:${ses.token}`)])
    return noContent()
  }
  return fail('not found', 404)
}
