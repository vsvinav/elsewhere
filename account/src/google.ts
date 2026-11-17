// Verifies Google ID tokens against Google's published keys. The only thing taken from a token is its verified address.
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com']
const JWKS_TTL_MS = 3600_000
const RSA = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }

interface Claims { iss?: unknown; aud?: unknown; exp?: unknown; email?: unknown; email_verified?: unknown }
interface Header { alg?: unknown; kid?: unknown }

let jwksFetch: typeof fetch = fetch
let cache: { keys: Map<string, JsonWebKey>; until: number } | null = null
/** Tests hand in a fetch that serves a key of their own. */
export const setJwksFetch = (f: typeof fetch) => { jwksFetch = f }
export const resetJwksForTest = () => { jwksFetch = fetch; cache = null }

const unb64url = (s: string): Uint8Array => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0))
function decode<T>(part: string): T | null {
  try { const v: unknown = JSON.parse(new TextDecoder().decode(unb64url(part))); return v && typeof v === 'object' ? (v as T) : null } catch { return null }
}

/** The address a token claims, before anything is checked; the limiter counts against it either way. */
export function claimedEmail(token: unknown): unknown {
  if (typeof token !== 'string') return undefined
  const parts = token.split('.')
  return parts.length === 3 ? decode<Claims>(parts[1])?.email : undefined
}

/** Google's current keys; a fetch that fails leaves whatever was cached in place, stale or not. */
async function keys(now: number, force = false): Promise<Map<string, JsonWebKey> | null> {
  if (cache && cache.until > now && !force) return cache.keys
  try {
    const r = await jwksFetch(JWKS_URL)
    if (!r.ok) throw new Error(String(r.status))
    const body = (await r.json()) as { keys?: Array<JsonWebKey & { kid?: string }> }
    const map = new Map<string, JsonWebKey>()
    for (const k of body.keys ?? []) if (k.kid) map.set(k.kid, k)
    cache = { keys: map, until: now + JWKS_TTL_MS }
    return map
  } catch { return cache?.keys ?? null }
}
/** A kid the cache does not know is most likely a rotation, so the keys are fetched once more before the token is refused. */
async function keyFor(kid: string, now: number): Promise<JsonWebKey | null> {
  const known = (await keys(now))?.get(kid)
  if (known) return known
  return (await keys(now, true))?.get(kid) ?? null
}

/** The verified email of a Google ID token meant for one of `audiences`, or null when anything about it is off. */
export async function verifyIdToken(token: string, audiences: string[], now: number): Promise<string | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const header = decode<Header>(parts[0]), claims = decode<Claims>(parts[1])
  if (!header || !claims || header.alg !== 'RS256' || typeof header.kid !== 'string') return null
  if (typeof claims.iss !== 'string' || !ISSUERS.includes(claims.iss)) return null
  if (typeof claims.aud !== 'string' || !audiences.includes(claims.aud)) return null
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return null
  if (claims.email_verified !== true || typeof claims.email !== 'string') return null
  const jwk = await keyFor(header.kid, now)
  if (!jwk) return null
  try {
    const key = await crypto.subtle.importKey('jwk', jwk, RSA, false, ['verify'])
    const ok = await crypto.subtle.verify(RSA.name, key, unb64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`))
    return ok ? claims.email : null
  } catch { return null }
}
