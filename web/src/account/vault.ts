// The recovery vault: identity + profile + a few settings, sealed on the device with a passphrase the service never sees.
// Byte-for-byte the same on Android (PBKDF2WithHmacSHA256 + AES/GCM/NoPadding); `vectors.json` pins the format.
import { randomBytes } from '@noble/hashes/utils.js'
import { b64, unb64 } from '../crew/keys'
import type { Profile } from '../profile/profile'

export const PBKDF2_ITERS = 310000
export const PASSPHRASE_MIN = 8
export const SALT_BYTES = 16
export const IV_BYTES = 12

export interface VaultBody { v: 1; salt: string; iv: string; ct: string }
export interface VaultSettings { units: 'km' | 'mi'; relayUrl: string; accountUrl?: string }
export interface VaultPlain { v: 1; signPriv: string; kxPriv: string; profile: Profile; settings: VaultSettings }

export const okPassphrase = (p: string) => p.trim().length >= PASSPHRASE_MIN
const bytes = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

/** PBKDF2-HMAC-SHA256 over the trimmed passphrase; slow by design, so callers show a spinner. */
export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase.trim()), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: bytes(salt), iterations: PBKDF2_ITERS }, material, 256)
  return new Uint8Array(bits)
}
const aesKey = (key: Uint8Array, use: KeyUsage) => crypto.subtle.importKey('raw', bytes(key), { name: 'AES-GCM' }, false, [use])

export async function encryptVault(key: Uint8Array, salt: Uint8Array, plaintext: string, iv: Uint8Array = randomBytes(IV_BYTES)): Promise<VaultBody> {
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bytes(iv) }, await aesKey(key, 'encrypt'), new TextEncoder().encode(plaintext))
  return { v: 1, salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)) }
}
/** Throws on a wrong key or a changed byte. */
export async function decryptVault(key: Uint8Array, body: VaultBody): Promise<string> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(unb64(body.iv)) }, await aesKey(key, 'decrypt'), bytes(unb64(body.ct)))
  return new TextDecoder().decode(pt)
}

export const newSalt = () => randomBytes(SALT_BYTES)
export const sealVault = (key: Uint8Array, salt: Uint8Array, plain: VaultPlain) => encryptVault(key, salt, JSON.stringify(plain))
export async function openVault(key: Uint8Array, body: VaultBody): Promise<VaultPlain> {
  const p = JSON.parse(await decryptVault(key, body)) as Partial<VaultPlain>
  if (p.v !== 1 || typeof p.signPriv !== 'string' || typeof p.kxPriv !== 'string' || !p.profile) throw new Error('not a vault')
  return { v: 1, signPriv: p.signPriv, kxPriv: p.kxPriv, profile: p.profile, settings: { units: p.settings?.units ?? p.profile.units ?? 'km', relayUrl: p.settings?.relayUrl ?? '', accountUrl: p.settings?.accountUrl } }
}
