// The recovery vault: identity + profile + a few settings, sealed on the device with a key the service never sees.
// v:1 is sealed under a passphrase (PBKDF2WithHmacSHA256 + AES/GCM/NoPadding; `vectors.json` pins the format);
// v:2 under the Drive key a Google sign-in fetches (ChaCha20-Poly1305, see `sync/wire.ts`). Byte-for-byte the same on Android.
import { randomBytes } from '@noble/hashes/utils.js'
import { b64, unb64 } from '../crew/keys'
import type { Profile, Work } from '../profile/profile'
import { openVault2Text, sealVault2, type VaultBody2 } from '../sync/wire'

export const PBKDF2_ITERS = 310000
export const PASSPHRASE_MIN = 12
export const SALT_BYTES = 16
export const IV_BYTES = 12

export interface VaultBody1 { v: 1; salt: string; iv: string; ct: string }
export type VaultBody = VaultBody1 | VaultBody2
export type { VaultBody2 }
export interface VaultSettings { units: 'km' | 'mi'; relayUrl: string; accountUrl?: string }
export interface VaultPlain { v: 1; signPriv: string; kxPriv: string; profile: Profile; settings: VaultSettings }

/** Phrases people reach for first; compared lower-case with the spaces taken out. Android keeps the same list. */
const EASY_PASSPHRASES = [
  'password1234', 'password12345', 'passwordpassword', 'mypassword123', 'secretpassword', 'supersecretpassword', 'thisismypassword', 'passphrase123',
  '123456789012', '1234567890123', 'qwertyuiop12', 'qwertyuiopasdfgh', 'qwertyuiopasdfghjkl', 'asdfghjkl123', 'zxcvbnmasdfghjkl', '1q2w3e4r5t6y', '1qaz2wsx3edc', 'abcdefghijkl', 'abcdefghijklmnop',
  'iloveyou1234', 'ilovemyfamily', 'letmeinletmein', 'administrator', 'adminpassword', 'welcome12345', 'changemechangeme', 'trustno1trustno1', 'rememberme123', 'hello12345678',
  'football12345', 'sunshine1234', 'princess1234', 'correcthorsebatterystaple', 'openthevault', 'elsewhere1234', 'elsewherepassword', 'recoverypassphrase',
]
/**
 * Why a passphrase is refused, or null. Length counts the trimmed phrase; the other checks ignore case and spaces,
 * so "Correct Horse Battery Staple" and "aaaa aaaa aaaa" are as easy as their one-word forms.
 */
export function passphraseProblem(p: string): 'short' | 'easy' | null {
  if (p.trim().length < PASSPHRASE_MIN) return 'short'
  const n = p.toLowerCase().replace(/\s+/g, '')
  if (/^(.)\1*$/u.test(n) || /^\d+$/.test(n) || EASY_PASSPHRASES.includes(n)) return 'easy'
  return null
}
export const okPassphrase = (p: string) => passphraseProblem(p) === null
const bytes = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

/** PBKDF2-HMAC-SHA256 over the trimmed passphrase; slow by design, so callers show a spinner. */
export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase.trim()), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: bytes(salt), iterations: PBKDF2_ITERS }, material, 256)
  return new Uint8Array(bits)
}
const aesKey = (key: Uint8Array, use: KeyUsage) => crypto.subtle.importKey('raw', bytes(key), { name: 'AES-GCM' }, false, [use])

export async function encryptVault(key: Uint8Array, salt: Uint8Array, plaintext: string, iv: Uint8Array = randomBytes(IV_BYTES)): Promise<VaultBody1> {
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bytes(iv) }, await aesKey(key, 'encrypt'), new TextEncoder().encode(plaintext))
  return { v: 1, salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)) }
}
/** Throws on a wrong key or a changed byte. */
export async function decryptVault(key: Uint8Array, body: VaultBody): Promise<string> {
  if (body.v === 2) return openVault2Text(key, body)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(unb64(body.iv)) }, await aesKey(key, 'decrypt'), bytes(unb64(body.ct)))
  return new TextDecoder().decode(pt)
}

export const newSalt = () => randomBytes(SALT_BYTES)
export const sealVault = (key: Uint8Array, salt: Uint8Array, plain: VaultPlain) => encryptVault(key, salt, JSON.stringify(plain))
/** The Google path: the Drive key seals the vault directly, no salt and no KDF. */
export const sealVaultWithDriveKey = (key: Uint8Array, plain: VaultPlain): VaultBody2 => sealVault2(key, plain)
const unitsOf = (u: unknown): 'km' | 'mi' => (String(u ?? '').toLowerCase() === 'mi' ? 'mi' : 'km')

/** Older Android vaults wrote `units` upper-case and works with `placeId`; both shapes open into the canonical profile. */
function normalizeProfile(raw: Profile): Profile {
  const works = (raw.works ?? []).map((w) => {
    const { placeId, ...rest } = w as Work & { placeId?: string }
    return { ...rest, place_id: rest.place_id ?? placeId ?? '' }
  })
  return { ...raw, units: unitsOf(raw.units), homes: raw.homes ?? [], works }
}

export async function openVault(key: Uint8Array, body: VaultBody): Promise<VaultPlain> {
  const p = JSON.parse(await decryptVault(key, body)) as Partial<VaultPlain>
  if (p.v !== 1 || typeof p.signPriv !== 'string' || typeof p.kxPriv !== 'string' || !p.profile) throw new Error('not a vault')
  const profile = normalizeProfile(p.profile)
  const units = p.settings?.units ? unitsOf(p.settings.units) : profile.units
  return { v: 1, signPriv: p.signPriv, kxPriv: p.kxPriv, profile, settings: { units, relayUrl: p.settings?.relayUrl ?? '', accountUrl: p.settings?.accountUrl } }
}
