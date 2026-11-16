import { ed25519, x25519 } from '@noble/curves/ed25519.js'
import { chacha20poly1305 } from '@noble/ciphers/chacha.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { bytesToHex, concatBytes, hexToBytes, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import { kv } from '../ingest/db'

/** A device's two keypairs: Ed25519 to sign relay requests, X25519 to agree a key with each friend. */
export interface DeviceKeys { signPriv: Uint8Array; signPub: Uint8Array; kxPriv: Uint8Array; kxPub: Uint8Array }
/** What the relay carries between two devices: a sender id and ChaCha20-Poly1305 ciphertext bound to the pair. */
export interface Envelope { v: 1; from: string; n: string; c: string }
export type SignedHeaders = { 'X-Elsewhere-Id': string; 'X-Elsewhere-Ts': string; 'X-Elsewhere-Sig': string }

const PAIR_INFO = 'elsewhere/pair/v1'
/** A request older or newer than this many seconds is refused. */
export const CLOCK_SKEW_S = 300
const KEYS_KV = 'crew:keys'

export const toHex = bytesToHex
export const fromHex = hexToBytes
export const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
/** RFC 4648 base32, upper case, no padding. */
export function base32nopad(bytes: Uint8Array): string {
  let out = '', bits = 0, acc = 0
  for (const byte of bytes) {
    acc = (acc << 8) | byte; bits += 8
    while (bits >= 5) { out += B32[(acc >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += B32[(acc << (5 - bits)) & 31]
  return out
}

export const deviceIdOf = (signPub: Uint8Array) => base32nopad(sha256(signPub)).slice(0, 16)
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
/** Crockford base32 (no I L O U), unpadded. */
export function crockford32(bytes: Uint8Array): string {
  let out = '', bits = 0, acc = 0
  for (const byte of bytes) {
    acc = (acc << 8) | byte; bits += 8
    while (bits >= 5) { out += CROCKFORD[(acc >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += CROCKFORD[(acc << (5 - bits)) & 31]
  return out
}
/** Short human check on the confirm step; it covers both keys so a swapped kx key would show. */
export const fingerprint = (signPub: Uint8Array, kxPub: Uint8Array) => crockford32(sha256(concatBytes(signPub, kxPub))).slice(0, 8)

/** Binds a device's kx key to its signing key so a relay cannot swap one in. */
const KX_INFO = utf8ToBytes('elsewhere/kx/v1')
export const kxSigOf = (keys: DeviceKeys) => b64(ed25519.sign(concatBytes(KX_INFO, keys.kxPub), keys.signPriv))
export function verifyKxSig(signPub: Uint8Array, kxPub: Uint8Array, kxSig: string): boolean {
  try { return ed25519.verify(unb64(kxSig), concatBytes(KX_INFO, kxPub), signPub) } catch { return false }
}

export function keysFromSeeds(signSeed: Uint8Array, kxSeed: Uint8Array): DeviceKeys {
  return { signPriv: signSeed, signPub: ed25519.getPublicKey(signSeed), kxPriv: kxSeed, kxPub: x25519.getPublicKey(kxSeed) }
}
export const generateKeys = () => keysFromSeeds(randomBytes(32), randomBytes(32))

const cmp = (a: Uint8Array, b: Uint8Array) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0 }
/** Same id from either side: the two sign keys are sorted before hashing. */
export function pairIdOf(signPubA: Uint8Array, signPubB: Uint8Array): string {
  const [x, y] = cmp(signPubA, signPubB) <= 0 ? [signPubA, signPubB] : [signPubB, signPubA]
  return base32nopad(sha256(concatBytes(x, y))).slice(0, 16)
}
export function pairKeyOf(myKxPriv: Uint8Array, theirKxPub: Uint8Array, pairId: string): Uint8Array {
  const shared = x25519.getSharedSecret(myKxPriv, theirKxPub)
  return hkdf(sha256, shared, utf8ToBytes(pairId), utf8ToBytes(PAIR_INFO), 32)
}

export function seal(pairKey: Uint8Array, pairId: string, from: string, plaintext: unknown, nonce = randomBytes(12)): Envelope {
  const c = chacha20poly1305(pairKey, nonce, utf8ToBytes(pairId)).encrypt(utf8ToBytes(JSON.stringify(plaintext)))
  return { v: 1, from, n: b64(nonce), c: b64(c) }
}
/** Throws when the tag fails: a wrong key, a wrong pair or a changed byte. */
export function open<T = unknown>(pairKey: Uint8Array, pairId: string, env: Envelope): T {
  const p = chacha20poly1305(pairKey, unb64(env.n), utf8ToBytes(pairId)).decrypt(unb64(env.c))
  return JSON.parse(new TextDecoder().decode(p)) as T
}

export const signedMessage = (method: string, path: string, ts: number, body: string) => `${method}\n${path}\n${ts}\n${bytesToHex(sha256(utf8ToBytes(body)))}`
export function signRequest(keys: DeviceKeys, method: string, path: string, body: string, ts = Math.floor(Date.now() / 1000)): SignedHeaders {
  const sig = ed25519.sign(utf8ToBytes(signedMessage(method, path, ts, body)), keys.signPriv)
  return { 'X-Elsewhere-Id': deviceIdOf(keys.signPub), 'X-Elsewhere-Ts': String(ts), 'X-Elsewhere-Sig': b64(sig) }
}
export function verifyRequest(signPub: Uint8Array, method: string, path: string, body: string, h: SignedHeaders, now = Math.floor(Date.now() / 1000)): boolean {
  const ts = Number(h['X-Elsewhere-Ts'])
  if (!Number.isFinite(ts) || Math.abs(now - ts) > CLOCK_SKEW_S) return false
  if (h['X-Elsewhere-Id'] !== deviceIdOf(signPub)) return false
  try { return ed25519.verify(unb64(h['X-Elsewhere-Sig']), utf8ToBytes(signedMessage(method, path, ts, body)), signPub) } catch { return false }
}

let loading: Promise<DeviceKeys> | undefined
/** This browser's keys, made on first use and kept in IndexedDB. */
export const loadKeys = () => (loading ??= kv.get<{ signSeed: string; kxSeed: string }>(KEYS_KV).then(async (s) => {
  if (s) return keysFromSeeds(fromHex(s.signSeed), fromHex(s.kxSeed))
  const k = generateKeys()
  await kv.set(KEYS_KV, { signSeed: toHex(k.signPriv), kxSeed: toHex(k.kxPriv) })
  return k
}))
/** A vault restore puts the account's identity on this device in place of the one made here; Crew pairs follow it. */
export async function replaceKeys(signSeed: Uint8Array, kxSeed: Uint8Array): Promise<DeviceKeys> {
  const k = keysFromSeeds(signSeed, kxSeed)
  await kv.set(KEYS_KV, { signSeed: toHex(k.signPriv), kxSeed: toHex(k.kxPriv) })
  // The share code on offer named the old identity; the next Crew visit mints one for this identity.
  await kv.del('crew:code')
  loading = Promise.resolve(k)
  return k
}
/** Tests swap in fixed keys. */
export const setKeysForTest = (k: DeviceKeys | undefined) => { loading = k ? Promise.resolve(k) : undefined }
