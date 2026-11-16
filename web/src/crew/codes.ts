import { randomBytes } from '@noble/hashes/utils.js'
import { kv } from '../ingest/db'

/** Crockford base32: no I, L, O or U, so a code reads aloud without doubt. */
export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const CODE_TTL_MS = 24 * 3600 * 1000
const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{7}$/

export const newCode = () => formatCode([...randomBytes(7)].map((b) => CROCKFORD[b & 31]).join(''))
/** `KSV7Q4K` → `PT-KSV-7Q4K`. */
export const formatCode = (raw: string) => `PT-${raw.slice(0, 3)}-${raw.slice(3)}`
/** Anything a person might type or paste: lower case, spaces, missing prefix, the QR link, I/L for 1 and O for 0. Null when it is not a code. */
export function parseCode(input: string): string | null {
  let s = input.trim().toUpperCase()
  const m = /PAIR\/(.+)$/.exec(s)
  if (m) s = m[1]
  s = s.replace(/[\s-]/g, '')
  if (s.startsWith('PT') && s.length === 9) s = s.slice(2)
  s = s.replace(/[IL]/g, '1').replace(/O/g, '0')
  return CODE_RE.test(s) ? formatCode(s) : null
}
/** The relay's rendezvous bucket: the first three letters. */
export const bucketOf = (code: string) => code.slice(3, 6)
export const isExpired = (madeAt: number, now: number) => now - madeAt >= CODE_TTL_MS
export function expiresIn(madeAt: number, now: number): string {
  const left = madeAt + CODE_TTL_MS - now
  if (left <= 0) return 'expired'
  if (left >= 3600 * 1000) return `${Math.floor(left / 3600_000)} h`
  return `${Math.max(1, Math.round(left / 60_000))} min`
}

export const CODE_KV = 'crew:code'
export interface ShareCode { value: string; madeAt: number }
const mint = async (now: number): Promise<ShareCode> => { const c = { value: newCode(), madeAt: now }; await kv.set(CODE_KV, c); return c }
/** The one code this device is offering: kept for its 24 h so reopening the sheet shows the same code a friend may already have. */
export async function currentCode(now = Date.now()): Promise<ShareCode> {
  const c = await kv.get<ShareCode>(CODE_KV)
  return c && typeof c.value === 'string' && typeof c.madeAt === 'number' && !isExpired(c.madeAt, now) ? c : mint(now)
}
/** After New code or once a friend has claimed the current one. */
export const rotateCode = (now = Date.now()) => mint(now)
