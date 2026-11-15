import { describe, expect, it } from 'vitest'
import { utf8ToBytes } from '@noble/hashes/utils.js'
import { b64, base32nopad, deviceIdOf, fingerprint, fromHex, keysFromSeeds, open, pairIdOf, pairKeyOf, seal, signRequest, signedMessage, toHex, verifyRequest, type Envelope } from './keys'
import vectors from './vectors.json'

const A = keysFromSeeds(fromHex(vectors.a.signSeed), fromHex(vectors.a.kxSeed))
const B = keysFromSeeds(fromHex(vectors.b.signSeed), fromHex(vectors.b.kxSeed))

describe('identity', () => {
  it('base32nopad matches RFC 4648 without padding', () => {
    expect(base32nopad(utf8ToBytes('foobar'))).toBe('MZXW6YTBOI')
    expect(base32nopad(utf8ToBytes('f'))).toBe('MY')
  })
  it('deviceId is 16 chars of base32 over sha256(signPub)', () => {
    const id = deviceIdOf(A.signPub)
    expect(id).toMatch(/^[A-Z2-7]{16}$/)
    expect(id).toBe(base32nopad(fromHex(vectors.a.signPubSha256)).slice(0, 16))
  })
  it('fingerprint is 8 chars and differs per key', () => {
    expect(fingerprint(A.signPub)).toHaveLength(8)
    expect(fingerprint(A.signPub)).not.toBe(fingerprint(B.signPub))
  })
  it('pairId and pairKey are the same from both sides', () => {
    expect(pairIdOf(A.signPub, B.signPub)).toBe(pairIdOf(B.signPub, A.signPub))
    const pid = pairIdOf(A.signPub, B.signPub)
    expect(toHex(pairKeyOf(A.kxPriv, B.kxPub, pid))).toBe(toHex(pairKeyOf(B.kxPriv, A.kxPub, pid)))
  })
})

describe('envelope', () => {
  const pid = pairIdOf(A.signPub, B.signPub)
  const key = pairKeyOf(A.kxPriv, B.kxPub, pid)
  it('round-trips and names the sender', () => {
    const env = seal(key, pid, deviceIdOf(A.signPub), { type: 'ping', t: 1 })
    expect(env.v).toBe(1)
    expect(env.from).toBe(deviceIdOf(A.signPub))
    expect(open(key, pid, env)).toEqual({ type: 'ping', t: 1 })
  })
  it('rejects a tampered ciphertext, a wrong key and a wrong pair', () => {
    const env = seal(key, pid, 'X', { type: 'stop' })
    const bad: Envelope = { ...env, c: b64(new Uint8Array([...fromB64(env.c)].map((x, i) => (i === 0 ? x ^ 1 : x)))) }
    expect(() => open(key, pid, bad)).toThrow()
    expect(() => open(pairKeyOf(A.kxPriv, A.kxPub, pid), pid, env)).toThrow()
    expect(() => open(key, 'OTHERPAIR', env)).toThrow()
  })
})

describe('signed requests', () => {
  it('verify accepts the real signature and rejects a bad one or a stale clock', () => {
    const h = signRequest(A, 'POST', '/pair/PT-AAA-BBBB', '{"x":1}', 1000)
    expect(h['X-Elsewhere-Id']).toBe(deviceIdOf(A.signPub))
    expect(verifyRequest(A.signPub, 'POST', '/pair/PT-AAA-BBBB', '{"x":1}', h, 1100)).toBe(true)
    expect(verifyRequest(A.signPub, 'POST', '/pair/PT-AAA-BBBB', '{"x":2}', h, 1100)).toBe(false)
    expect(verifyRequest(B.signPub, 'POST', '/pair/PT-AAA-BBBB', '{"x":1}', h, 1100)).toBe(false)
    expect(verifyRequest(A.signPub, 'POST', '/pair/PT-AAA-BBBB', '{"x":1}', h, 1400)).toBe(false)
  })
})

describe('interop vectors', () => {
  it('derives every value in vectors.json', () => {
    for (const [k, d] of [['a', A], ['b', B]] as const) {
      const v = vectors[k]
      expect(toHex(d.signPub)).toBe(v.signPub)
      expect(toHex(d.kxPub)).toBe(v.kxPub)
      expect(deviceIdOf(d.signPub)).toBe(v.deviceId)
    }
    const pid = pairIdOf(A.signPub, B.signPub)
    expect(pid).toBe(vectors.pairId)
    const key = pairKeyOf(A.kxPriv, B.kxPub, pid)
    expect(toHex(key)).toBe(vectors.pairKey)
    const env = seal(key, pid, vectors.a.deviceId, JSON.parse(vectors.envelope.plaintext), fromHex(vectors.envelope.nonceHex))
    expect(env).toEqual(vectors.envelope.envelope)
    expect(JSON.stringify(open(key, pid, env))).toBe(vectors.envelope.plaintext)
    const r = vectors.signedRequest
    expect(signedMessage(r.method, r.path, r.ts, r.body)).toBe(r.message)
    const h = signRequest(A, r.method, r.path, r.body, r.ts)
    expect(h['X-Elsewhere-Sig']).toBe(r.signature)
  })
})

const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
