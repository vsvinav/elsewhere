import { describe, expect, it, vi } from 'vitest'
import { KeyError, claim, friendOf, offer, poll, proposalOf } from './pairing'
import { relayClient, RelayError } from './relay'
import { deviceIdOf, fingerprint, fromHex, keysFromSeeds, kxSigOf, pairIdOf, pairKeyOf, toHex } from './keys'
import vectors from './vectors.json'

const A = keysFromSeeds(fromHex(vectors.a.signSeed), fromHex(vectors.a.kxSeed))
const B = keysFromSeeds(fromHex(vectors.b.signSeed), fromHex(vectors.b.kxSeed))
const bRecord = { signPub: toHex(B.signPub), kxPub: toHex(B.kxPub), kxSig: kxSigOf(B), name: 'Marta', deviceId: deviceIdOf(B.signPub) }

/** A relay that answers from a script and remembers what it was asked. */
const fakeRelay = (answers: Record<string, () => Response>) => {
  const calls: { method: string; path: string; body: string; headers: Headers }[] = []
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    calls.push({ method, path: url.pathname, body: String(init?.body ?? ''), headers: new Headers(init?.headers) })
    const key = `${method} ${url.pathname}`
    return answers[key] ? answers[key]() : new Response('not found', { status: 404 })
  }) as typeof fetch
  return { calls, client: relayClient('https://relay.test', A, fetchFn) }
}

describe('relay client', () => {
  it('signs every request with the device headers and surfaces relay errors', async () => {
    const { calls, client } = fakeRelay({ 'POST /pair/PT-KSV-7Q4K': () => new Response('created', { status: 201 }), 'GET /room/X/last': () => new Response('nope', { status: 403 }) })
    await client.createCode('PT-KSV-7Q4K', { signPub: toHex(A.signPub), kxPub: toHex(A.kxPub), kxSig: kxSigOf(A), name: 'Ana' })
    expect(calls[0].headers.get('X-Elsewhere-Id')).toBe(deviceIdOf(A.signPub))
    expect(calls[0].headers.get('X-Elsewhere-Sig')).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(Math.abs(Number(calls[0].headers.get('X-Elsewhere-Ts')) - Date.now() / 1000)).toBeLessThan(5)
    await expect(client.last('X')).rejects.toBeInstanceOf(RelayError)
    await expect(client.last('X')).rejects.toMatchObject({ status: 403 })
  })
})

describe('pairing flow', () => {
  it('offer posts my record; poll is null while pending and a proposal once claimed', async () => {
    let claimed = false
    const { calls, client } = fakeRelay({
      'POST /pair/PT-KSV-7Q4K': () => new Response('created', { status: 201 }),
      'GET /pair/PT-KSV-7Q4K': () => (claimed ? Response.json(bRecord) : new Response(null, { status: 204 })),
    })
    await offer(client, A, 'PT-KSV-7Q4K', 'Ana')
    expect(JSON.parse(calls[0].body)).toEqual({ signPub: toHex(A.signPub), kxPub: toHex(A.kxPub), kxSig: kxSigOf(A), name: 'Ana' })
    expect(await poll(client, 'PT-KSV-7Q4K')).toBeNull()
    claimed = true
    const p = await poll(client, 'PT-KSV-7Q4K')
    expect(p).toEqual({ deviceId: bRecord.deviceId, name: 'Marta', signPub: bRecord.signPub, kxPub: bRecord.kxPub, fingerprint: fingerprint(B.signPub, B.kxPub) })
  })
  it('claim returns the owner as a proposal; a wrong code reports the relay status', async () => {
    const { client } = fakeRelay({ 'POST /pair/PT-KSV-7Q4K/claim': () => Response.json(bRecord), 'POST /pair/PT-ZZZ-ZZZZ/claim': () => new Response('no such code', { status: 404 }) })
    expect((await claim(client, A, 'PT-KSV-7Q4K', 'Ana')).name).toBe('Marta')
    await expect(claim(client, A, 'PT-ZZZ-ZZZZ', 'Ana')).rejects.toMatchObject({ status: 404 })
  })
  it('a record whose key does not hash to its id is refused', () => {
    expect(() => proposalOf({ ...bRecord, deviceId: 'AAAAAAAAAAAAAAAA' })).toThrow(KeyError)
  })
  it('a record whose kx key was swapped by the relay is refused before any pair key exists', () => {
    const C = keysFromSeeds(fromHex(vectors.a.kxSeed), fromHex(vectors.b.signSeed))
    expect(() => proposalOf({ ...bRecord, kxPub: toHex(C.kxPub) })).toThrow(KeyError)
    expect(() => proposalOf({ ...bRecord, kxPub: toHex(C.kxPub), kxSig: kxSigOf(C) })).toThrow(KeyError)
    expect(() => proposalOf({ ...bRecord, kxSig: '' })).toThrow(KeyError)
    expect(() => proposalOf({ ...(bRecord as Omit<typeof bRecord, 'kxSig'> & { kxSig?: string }), kxSig: undefined } as never)).toThrow(KeyError)
  })
  it('friendOf derives the pair key only once the user confirms; city and Sonar start on, precise off', () => {
    const f = friendOf(A, proposalOf(bRecord), 1234)
    const pid = pairIdOf(A.signPub, B.signPub)
    expect(f).toMatchObject({ deviceId: bRecord.deviceId, name: 'Marta', pairId: pid, pairKey: toHex(pairKeyOf(A.kxPriv, B.kxPub, pid)), addedAt: 1234, grants: { liveCity: true, livePrecise: false, sonar: true } })
    expect(toHex(pairKeyOf(B.kxPriv, A.kxPub, pid))).toBe(f.pairKey)
  })
})

describe('room sockets', () => {
  it('opens one socket per friend with a signed query, feeds envelopes in, reconnects after a drop', async () => {
    vi.useFakeTimers()
    const { connectRooms } = await import('./relay')
    const sockets: FakeWS[] = []
    class FakeWS { url: string; onopen: (() => void) | null = null; onmessage: ((e: { data: string }) => void) | null = null; onclose: (() => void) | null = null; sent: string[] = []; closed = false; constructor(url: string) { this.url = url; sockets.push(this) } send(s: string) { this.sent.push(s) } close() { this.closed = true; this.onclose?.() } }
    const got: unknown[] = []
    const stop = connectRooms({ base: 'https://relay.test', keys: A, pairIds: ['YNSO47A5246FH5MO', 'ABCDEFGHIJKLMNOP'], onEnvelope: (e) => got.push(e), WS: FakeWS as unknown as typeof WebSocket })
    expect(sockets.map((s) => s.url.replace(/\?.*/, ''))).toEqual(['wss://relay.test/room/YNSO47A5246FH5MO', 'wss://relay.test/room/ABCDEFGHIJKLMNOP'])
    expect(new URL(sockets[0].url).searchParams.get('id')).toBe(deviceIdOf(A.signPub))
    expect(new URL(sockets[0].url).searchParams.get('sig')).toBeTruthy()
    sockets[0].onopen?.()
    sockets[0].onmessage?.({ data: JSON.stringify({ v: 1, from: 'X', n: 'n', c: 'c' }) })
    sockets[0].onmessage?.({ data: 'garbage' })
    expect(got).toEqual([{ v: 1, from: 'X', n: 'n', c: 'c' }])
    sockets[0].onclose?.()
    await vi.advanceTimersByTimeAsync(2500)
    expect(sockets).toHaveLength(3)
    stop()
    expect(sockets.slice(1).every((s) => s.closed)).toBe(true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(sockets).toHaveLength(3)
    vi.useRealTimers()
  })
})
