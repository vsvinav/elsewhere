// Identity helpers shared by the Worker, the Durable Objects and the tests. Same derivations as the web client.

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export function base32nopad(bytes: Uint8Array): string {
  let out = '', bits = 0, acc = 0
  for (const byte of bytes) {
    acc = (acc << 8) | byte; bits += 8
    while (bits >= 5) { out += B32[(acc >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += B32[(acc << (5 - bits)) & 31]
  return out
}
export const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
export const unhex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16))
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
export const sha256 = async (b: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', b as BufferSource))

export const deviceIdOf = async (signPub: Uint8Array) => base32nopad(await sha256(signPub)).slice(0, 16)
const cmp = (a: Uint8Array, b: Uint8Array) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0 }
export async function pairIdOf(signPubA: Uint8Array, signPubB: Uint8Array): Promise<string> {
  const [x, y] = cmp(signPubA, signPubB) <= 0 ? [signPubA, signPubB] : [signPubB, signPubA]
  const both = new Uint8Array(x.length + y.length); both.set(x); both.set(y, x.length)
  return base32nopad(await sha256(both)).slice(0, 16)
}

/** Crockford base32 share code: PT-XXX-XXXX, no I L O U. */
export const CODE_RE = /^PT-[0-9A-HJKMNP-TV-Z]{3}-[0-9A-HJKMNP-TV-Z]{4}$/
export const ID_RE = /^[A-Z2-7]{16}$/
export const HEX32_RE = /^[0-9a-f]{64}$/

export const CLOCK_SKEW_S = 300
export const signedMessage = async (method: string, path: string, ts: string, body: string) =>
  `${method}\n${path}\n${ts}\n${hex(await sha256(new TextEncoder().encode(body)))}`

export async function verifySignature(signPubHex: string, message: string | Uint8Array, sigB64: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey('raw', unhex(signPubHex) as BufferSource, { name: 'Ed25519' }, false, ['verify'])
    const bytes = typeof message === 'string' ? new TextEncoder().encode(message) : message
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, unb64(sigB64) as BufferSource, bytes as BufferSource)
  } catch { return false }
}

/** The bytes a device signs to vouch for its kx key: a domain tag then the key. */
export function kxMessage(kxPub: Uint8Array): Uint8Array {
  const tag = new TextEncoder().encode('elsewhere/kx/v1')
  const out = new Uint8Array(tag.length + kxPub.length); out.set(tag); out.set(kxPub, tag.length)
  return out
}
export const verifyKxSig = (signPubHex: string, kxPubHex: string, kxSigB64: string) => verifySignature(signPubHex, kxMessage(unhex(kxPubHex)), kxSigB64)
