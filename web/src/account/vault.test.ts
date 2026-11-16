import { describe, expect, it } from 'vitest'
import vectors from './vectors.json'
import { b64, fromHex, toHex, unb64 } from '../crew/keys'
import { PASSPHRASE_MIN, PBKDF2_ITERS, decryptVault, deriveKey, encryptVault, okPassphrase, sealVault, openVault, type VaultPlain } from './vault'

describe('vault format', () => {
  it('derives the vector key from the passphrase and salt', async () => {
    expect(PBKDF2_ITERS).toBe(vectors.iterations)
    const key = await deriveKey(vectors.passphrase, unb64(vectors.salt))
    expect(toHex(key)).toBe(vectors.key_hex)
  })
  it('decrypts the vector ciphertext to the plaintext', async () => {
    const key = fromHex(vectors.key_hex)
    expect(await decryptVault(key, { v: 1, salt: vectors.salt, iv: vectors.iv, ct: vectors.ct })).toBe(vectors.plaintext)
  })
  it('encrypts the plaintext with the vector salt and iv to exactly the vector ciphertext', async () => {
    const key = fromHex(vectors.key_hex)
    const body = await encryptVault(key, unb64(vectors.salt), vectors.plaintext, unb64(vectors.iv))
    expect(body).toEqual({ v: 1, salt: vectors.salt, iv: vectors.iv, ct: vectors.ct })
  })
  it('a wrong key or a flipped byte fails to open', async () => {
    const key = fromHex(vectors.key_hex)
    const other = fromHex(vectors.key_hex.replace(/^a1/, 'a2'))
    await expect(decryptVault(other, { v: 1, salt: vectors.salt, iv: vectors.iv, ct: vectors.ct })).rejects.toThrow()
    const bytes = unb64(vectors.ct); bytes[5] ^= 1
    await expect(decryptVault(key, { v: 1, salt: vectors.salt, iv: vectors.iv, ct: b64(bytes) })).rejects.toThrow()
  })
  it('seal/open round-trips a plaintext object with a fresh iv under a passphrase-derived key', async () => {
    const plain: VaultPlain = { v: 1, signPriv: 'aa'.repeat(32), kxPriv: 'bb'.repeat(32), profile: { name: 'Ada', units: 'km', homes: [], works: [] }, settings: { units: 'km', relayUrl: 'https://relay.elsewhere.app' } }
    const salt = unb64(vectors.salt)
    const key = await deriveKey(' pass phrase ok ', salt)
    const body = await sealVault(key, salt, plain)
    expect(body.v).toBe(1)
    expect(body.salt).toBe(vectors.salt)
    expect(unb64(body.iv)).toHaveLength(12)
    expect(await openVault(key, body)).toEqual(plain)
    // The passphrase is trimmed before derivation, so stray spaces around it do not lock the vault.
    expect(toHex(await deriveKey('pass phrase ok', salt))).toBe(toHex(key))
  })
  it('opens an older Android plaintext: upper-case units and works keyed by placeId', async () => {
    const salt = unb64(vectors.salt)
    const key = await deriveKey('pass phrase ok', salt)
    const raw = { v: 1, signPriv: 'aa'.repeat(32), kxPriv: 'bb'.repeat(32), profile: { name: 'Ada', units: 'MI', homes: [], works: [{ lat: 1, lng: 2, placeId: 'x', from: 0, to: null }] } }
    const opened = await openVault(key, await encryptVault(key, salt, JSON.stringify(raw)))
    expect(opened.profile.units).toBe('mi')
    expect(opened.settings.units).toBe('mi')
    expect(opened.profile.works[0].place_id).toBe('x')
    expect(opened.profile.works[0]).not.toHaveProperty('placeId')
  })
  it('a passphrase needs eight characters after trimming', () => {
    expect(PASSPHRASE_MIN).toBe(8)
    expect(okPassphrase('  short  ')).toBe(false)
    expect(okPassphrase('1234567')).toBe(false)
    expect(okPassphrase('12345678')).toBe(true)
    expect(okPassphrase('  eight ch  ')).toBe(true)
  })
})
