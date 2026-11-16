// End to end: the real web client (keys, codes, pairing, relay transport, Sonar) against the real relay Worker, started
// in-process with wrangler's unstable_dev. No fetch mocks; Node's global fetch and WebSocket carry every byte.
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { sealFor, type Friend, type Message, type Ping } from './friends'
import { deviceIdOf, fromHex, generateKeys, open, signRequest, type DeviceKeys, type Envelope } from './keys'
import { newCode } from './codes'
import { claim, friendOf, offer, poll } from './pairing'
import { connectRooms, relayClient, RelayError, type RelayClient } from './relay'
import { decide, recordHit, type Debounce, type Side } from '../sonar/sonar'

interface Relay { url: string; stop(): Promise<void> }

async function startRelay(): Promise<Relay | null> {
  const relayDir = fileURLToPath(new URL('../../../relay/', import.meta.url))
  try {
    const wrangler = await import(/* @vite-ignore */ `${relayDir}node_modules/wrangler/wrangler-dist/cli.js`)
    const w = await wrangler.unstable_dev(`${relayDir}src/index.ts`, {
      config: `${relayDir}wrangler.toml`, port: 0, logLevel: 'error', persist: false, experimental: { disableExperimentalWarning: true },
    })
    const url = `http://${w.address}:${w.port}`
    for (let i = 0; i < 50; i++) {
      const ok = await fetch(`${url}/healthz`).then((r) => r.ok, () => false)
      if (ok) return { url, stop: () => w.stop() }
      await sleep(100)
    }
    await w.stop()
  } catch { /* no workerd here */ }
  return null
}

const relay = await startRelay()
afterAll(async () => { await relay?.stop() })
afterEach(() => vi.useRealTimers())

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until<T>(f: () => T | undefined | null | false, ms = 5000): Promise<T> {
  const end = Date.now() + ms
  for (;;) {
    const v = f()
    if (v) return v
    if (Date.now() > end) throw new Error('timed out')
    await sleep(25)
  }
}

/** A browser: its keys, its relay client and what has arrived on its sockets. */
class Device {
  keys: DeviceKeys
  id: string
  client: RelayClient
  inbox: Envelope[] = []
  constructor(public name: string) {
    this.keys = generateKeys()
    this.id = deviceIdOf(this.keys.signPub)
    this.client = relayClient(relay!.url, this.keys)
  }
  /** One live socket per pair, exactly as the Map does. */
  join(pairIds: string[]) {
    return connectRooms({ base: relay!.url, keys: this.keys, pairIds, onEnvelope: (e) => this.inbox.push(e) })
  }
  /** Drops one envelope through a fresh socket and hangs up, the way `startRooms` does when no room socket is open. */
  async drop(pairId: string, e: Envelope) {
    const once = this.join([pairId])
    try {
      await until(() => once.send(pairId, e))
      await sleep(150)
    } finally { once() }
  }
  next(ms = 5000) { return until(() => this.inbox.shift(), ms) }
  decrypt(f: Friend, e: Envelope) { return open<Message>(fromHex(f.pairKey), f.pairId, e) }
}

/** The full pairing dance the Crew sheet drives: A offers a code, B claims it, A polls, each confirms the other. */
async function pairUp(a: Device, b: Device) {
  const code = newCode()
  await offer(a.client, a.keys, code, a.name)
  expect(await poll(a.client, code)).toBeNull()
  const bSees = await claim(b.client, b.keys, code, b.name)
  const aSees = await poll(a.client, code)
  expect(aSees).not.toBeNull()
  return { aFriend: friendOf(a.keys, aSees!), bFriend: friendOf(b.keys, bSees), code }
}

const LISBON = { lat: 38.7223, lng: -9.1393 }
const ping = (at: { lat: number; lng: number }, t: number, hit: Ping['hit'] = null, extra: Partial<Ping> = {}): Ping =>
  ({ type: 'ping', t, grade: 'sonar', lat: at.lat, lng: at.lng, city: 'Lisbon', habitat: false, absenceDays: 200, hit, ...extra })
const sideOf = (p: Ping): Side => ({ fix: { ts: p.t * 1000, lat: p.lat, lng: p.lng }, habitat: p.habitat, absenceDays: p.absenceDays })

describe.skipIf(!relay)('web client ↔ relay worker', () => {
  it('pairs two devices through codes and both derive the same pair id and key', async () => {
    const a = new Device('Ana'), b = new Device('Bo')
    const { aFriend, bFriend, code } = await pairUp(a, b)
    expect(aFriend.pairId).toBe(bFriend.pairId)
    expect(aFriend.pairKey).toBe(bFriend.pairKey)
    expect(aFriend.deviceId).toBe(b.id)
    expect(bFriend.deviceId).toBe(a.id)
    expect(aFriend.name).toBe('Bo')
    await expect(poll(a.client, code)).rejects.toMatchObject({ status: 404 })
  })

  it('fans an encrypted ping across the room, refuses tampering, outsiders, stale clocks and oversize frames', async () => {
    const a = new Device('Ana'), b = new Device('Bo'), c = new Device('Cy')
    const { aFriend, bFriend } = await pairUp(a, b)
    const pid = aFriend.pairId
    const roomA = a.join([pid]), roomB = b.join([pid])
    try {
      const now = Math.floor(Date.now() / 1000)
      const first = ping(LISBON, now)
      await until(() => roomA.send(pid, sealFor(aFriend, a.id, first)))
      const got = await b.next()
      expect(got.from).toBe(a.id)
      expect(b.decrypt(bFriend, got)).toEqual(first)

      // Same socket, inside the 10 s gap: the relay drops it on the floor.
      expect(roomA.send(pid, sealFor(aFriend, a.id, ping(LISBON, now + 1)))).toBe(true)
      await sleep(400)
      expect(b.inbox).toHaveLength(0)

      // One flipped ciphertext byte travels fine but fails the Poly1305 tag on B.
      const env = sealFor(aFriend, a.id, ping(LISBON, now + 2))
      const bytes = Uint8Array.from(atob(env.c), (ch) => ch.charCodeAt(0))
      bytes[3] ^= 0x01
      await a.drop(pid, { ...env, c: btoa(String.fromCharCode(...bytes)) })
      const tampered = await b.next()
      expect(() => b.decrypt(bFriend, tampered)).toThrow()

      // Over 512 bytes: dropped, while a normal one right after it lands.
      await a.drop(pid, sealFor(aFriend, a.id, ping(LISBON, now + 3, null, { city: 'x'.repeat(600) })))
      const small = ping(LISBON, now + 4)
      await a.drop(pid, sealFor(aFriend, a.id, small))
      expect(b.decrypt(bFriend, await b.next())).toEqual(small)
      expect(b.inbox).toHaveLength(0)

      // A stranger with a valid key: unknown to the relay → 401; known but not a member → 403. Both over HTTP and WS.
      await expect(c.client.last(pid)).rejects.toMatchObject({ status: 401 })
      await offer(c.client, c.keys, newCode(), c.name)
      await expect(c.client.last(pid)).rejects.toMatchObject({ status: 403 })
      expect(await wsOutcome(c.keys, pid)).toBe('refused')
      expect(await wsOutcome(a.keys, pid)).toBe('open')

      // A's clock ten minutes behind: every signature is stale.
      expect(await wsOutcome(a.keys, pid, Math.floor(Date.now() / 1000) - 600)).toBe('refused')
      vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.now() - 600_000)
      await expect(a.client.last(pid)).rejects.toMatchObject({ status: 401 })
      vi.useRealTimers()
      expect(await a.client.last(pid)).toHaveLength(1)
    } finally { roomA(); roomB() }
  })

  it('Sonar: B fires on A ping, A echoes the same hit, then both go quiet within the debounce window', async () => {
    const a = new Device('Ana'), b = new Device('Bo')
    const { aFriend, bFriend } = await pairUp(a, b)
    const pid = aFriend.pairId
    const roomA = a.join([pid]), roomB = b.join([pid])
    try {
      const nowMs = Date.now(), now = Math.floor(nowMs / 1000)
      const nearby = { lat: LISBON.lat + 0.004, lng: LISBON.lng }
      let debA: Debounce = { lastHitByPair: {} }, debB: Debounce = { lastHitByPair: {} }
      const mine = (at: { lat: number; lng: number }) => sideOf(ping(at, now))

      await until(() => roomA.send(pid, sealFor(aFriend, a.id, ping(LISBON, now))))
      const fromA = b.decrypt(bFriend, await b.next()) as Ping
      const onB = decide(mine(nearby), sideOf(fromA), pid, nowMs, debB, fromA.hit?.id ?? null)
      expect(onB.kind).toBe('fire')
      if (onB.kind !== 'fire') return
      debB = recordHit(debB, pid, nowMs)
      await until(() => roomB.send(pid, sealFor(bFriend, b.id, ping(nearby, now, { id: onB.hitId, t: now }))))

      const fromB = a.decrypt(aFriend, await a.next()) as Ping
      expect(fromB.hit?.id).toBe(onB.hitId)
      const onA = decide(mine(LISBON), sideOf(fromB), pid, nowMs, debA, fromB.hit?.id ?? null)
      expect(onA).toEqual({ kind: 'echo', hitId: onB.hitId })
      debA = recordHit(debA, pid, nowMs)

      // The next eligible exchange, an hour on, is swallowed by the 24 h debounce on both sides.
      const later = nowMs + 3600_000, laterS = Math.floor(later / 1000)
      await a.drop(pid, sealFor(aFriend, a.id, ping(LISBON, laterS)))
      const again = b.decrypt(bFriend, await b.next()) as Ping
      expect(decide(sideOf(ping(nearby, laterS)), sideOf(again), pid, later, debB, null)).toEqual({ kind: 'quiet' })
      expect(decide(sideOf(ping(LISBON, laterS)), sideOf(ping(nearby, laterS)), pid, later, debA, null)).toEqual({ kind: 'quiet' })
    } finally { roomA(); roomB() }
  })

  it('rate limits the 11th code in an hour and a tombstone takes the device and its rooms away', async () => {
    const d = new Device('Dee')
    for (let i = 0; i < 10; i++) await offer(d.client, d.keys, newCode(), d.name)
    await expect(offer(d.client, d.keys, newCode(), d.name)).rejects.toMatchObject({ status: 429 })

    const a = new Device('Ana'), b = new Device('Bo')
    const { aFriend, bFriend } = await pairUp(a, b)
    const pid = aFriend.pairId
    const roomB = b.join([pid])
    try {
      await a.drop(pid, sealFor(aFriend, a.id, ping(LISBON, Math.floor(Date.now() / 1000))))
      await b.next()
      expect((await b.client.last(pid)).map((e) => e.from)).toEqual([a.id])
      await a.client.deleteMe()
      await expect(b.client.last(pid)).rejects.toMatchObject({ status: 403 })
      await expect(a.client.last(pid)).rejects.toMatchObject({ status: 401 })
      expect(await wsOutcome(b.keys, pid)).toBe('refused')
    } finally { roomB() }
  })

  it('`last` hands a reconnecting device the ping it missed', async () => {
    const a = new Device('Ana'), b = new Device('Bo')
    const { aFriend, bFriend } = await pairUp(a, b)
    const pid = aFriend.pairId
    const roomB = b.join([pid])
    await until(() => wsOutcome(b.keys, pid).then((r) => r === 'open'))
    roomB()
    const missed = ping(LISBON, Math.floor(Date.now() / 1000))
    await a.drop(pid, sealFor(aFriend, a.id, missed))
    expect(b.inbox).toHaveLength(0)
    const last = await b.client.last(pid)
    const theirs = last.filter((e) => e.from !== b.id)
    expect(theirs).toHaveLength(1)
    expect(b.decrypt(bFriend, theirs[0])).toEqual(missed)
    expect(await a.client.last(pid)).toEqual(last)
  })
})

/** Dials the room directly with the client's signature scheme; 'open' once the relay upgrades, 'refused' when it does not. */
function wsOutcome(keys: DeviceKeys, pairId: string, ts?: number): Promise<'open' | 'refused'> {
  const path = `/room/${pairId}`
  const h = signRequest(keys, 'GET', path, '', ts)
  const q = new URLSearchParams({ id: h['X-Elsewhere-Id'], ts: h['X-Elsewhere-Ts'], sig: h['X-Elsewhere-Sig'] })
  const ws = new WebSocket(`${relay!.url.replace(/^http/, 'ws')}${path}?${q}`)
  return new Promise((res) => {
    ws.onopen = () => { ws.close(); res('open') }
    ws.onerror = () => res('refused')
    ws.onclose = () => res('refused')
  })
}
