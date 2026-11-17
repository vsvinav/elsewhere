// The bytes that cross between devices: sealed sync blobs, the Drive-keyed vault and the plaintext shapes inside them.
// Android writes and reads exactly this; `wire.test.ts` pins a vector both sides assert.
import { chacha20poly1305 } from '@noble/ciphers/chacha.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import { b64, unb64 } from '../crew/keys'
import type { VaultPlain } from '../account/vault'

export const NONCE_BYTES = 12
export const KEY_BYTES = 32
/** The one blob that is not a month of stays. */
export const PROFILE_KEY = 'profile'
export const SYNC_KEY_RE = /^[a-z]_[a-z0-9]{1,16}:\d{4}-\d{2}$|^profile$/
const VAULT_AAD = 'vault'

/** What the service stores under `sync:<acct>:<key>`; `ts` is epoch milliseconds and orders writes. */
export interface SyncBlob { v: 1; ts: number; nonce: string; ct: string }
export interface Stay { id: string; lat: number; lng: number; name: string; start: number; end: number }
/** One source's stays in one UTC month; `start`/`end` are epoch seconds. */
export interface MonthChunk { v: 1; stays: Stay[] }
export interface HomeWire { name: string; lat: number; lng: number; from: string | null; to: string | null; city: string; cc: string }
export interface ProfileWire { v: 1; ts: number; name: string | null; homes: HomeWire[]; units: 'km' | 'mi' }
export interface VaultBody2 { v: 2; iv: string; ct: string }

const aead = (key: Uint8Array, nonce: Uint8Array, aad: string) => chacha20poly1305(key, nonce, utf8ToBytes(aad))

/** ChaCha20-Poly1305 over the JSON of `plain`, bound to the blob's key name so a chunk cannot be replayed under another. */
export function sealBlob(key: Uint8Array, name: string, plain: unknown, ts: number, nonce: Uint8Array = randomBytes(NONCE_BYTES)): SyncBlob {
  const ct = aead(key, nonce, name).encrypt(utf8ToBytes(JSON.stringify(plain)))
  return { v: 1, ts, nonce: b64(nonce), ct: b64(ct) }
}
/** Throws on a wrong key, a wrong name or a changed byte. */
export function openBlob<T = unknown>(key: Uint8Array, name: string, blob: SyncBlob): T {
  const pt = aead(key, unb64(blob.nonce), name).decrypt(unb64(blob.ct))
  return JSON.parse(new TextDecoder().decode(pt)) as T
}

export function sealVault2(key: Uint8Array, plain: VaultPlain, iv: Uint8Array = randomBytes(NONCE_BYTES)): VaultBody2 {
  const ct = aead(key, iv, VAULT_AAD).encrypt(utf8ToBytes(JSON.stringify(plain)))
  return { v: 2, iv: b64(iv), ct: b64(ct) }
}
export function openVault2Text(key: Uint8Array, body: VaultBody2): string {
  return new TextDecoder().decode(aead(key, unb64(body.iv), VAULT_AAD).decrypt(unb64(body.ct)))
}

/** `yyyy-mm` of an epoch-seconds instant, in UTC on every device. */
export const monthOf = (startSec: number) => new Date(startSec * 1000).toISOString().slice(0, 7)
export const stayId = (source: string, startSec: number) => bytesToHex(sha256(utf8ToBytes(`${source}|${startSec}`)))
export const chunkKey = (source: string, month: string) => `${source}:${month}`
/** A Timeline export is its own source, named by the hash the record already carries. */
export const importSource = (exportSha256Hex: string) => `i_${exportSha256Hex.slice(0, 12)}`
export const newSyncKey = () => randomBytes(KEY_BYTES)
