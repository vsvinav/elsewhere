import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ store: new Map<string, unknown>() }))
vi.mock('../ingest/db', () => ({ kv: { get: async (k: string) => db.store.get(k), set: async (k: string, v: unknown) => { db.store.set(k, v) }, del: async (k: string) => { db.store.delete(k) } } }))

import { DROP_MS, STALE_MS, ageLabel, sonarHooks, useCrew, visibleFixes, type Friend, type Ping } from './friends'
import { deviceIdOf, fromHex, keysFromSeeds, pairIdOf, pairKeyOf, seal, setKeysForTest, toHex } from './keys'
import vectors from './vectors.json'

const A = keysFromSeeds(fromHex(vectors.a.signSeed), fromHex(vectors.a.kxSeed))
const B = keysFromSeeds(fromHex(vectors.b.signSeed), fromHex(vectors.b.kxSeed))
const pid = pairIdOf(A.signPub, B.signPub)
const key = pairKeyOf(A.kxPriv, B.kxPub, pid)
const marta: Friend = { deviceId: deviceIdOf(B.signPub), name: 'Marta', signPub: toHex(B.signPub), kxPub: toHex(B.kxPub), pairId: pid, pairKey: toHex(key), addedAt: 1, grants: { liveCity: false, livePrecise: false, sonar: false } }
const fromMarta = (m: unknown) => seal(key, pid, marta.deviceId, m)
const NOW = Date.UTC(2025, 10, 15, 16, 0, 0)
const ping = (p: Partial<Ping> = {}): Ping => ({ type: 'ping', t: Math.floor(NOW / 1000) - 60, grade: 'city', lat: 38.72, lng: -9.14, city: 'Lisbon', habitat: false, absenceDays: 212, hit: null, ...p })

beforeEach(async () => {
  db.store.clear()
  setKeysForTest(A)
  useCrew.setState({ loaded: false, friends: [], fixes: {}, hit: null, tag: null })
  await useCrew.getState().load()
})

describe('friends store', () => {
  it('loads empty, adds a friend with every grant off, and persists', async () => {
    expect(useCrew.getState().friends).toEqual([])
    await useCrew.getState().add(marta)
    expect(useCrew.getState().friends).toHaveLength(1)
    expect((db.store.get('crew:friends') as Friend[])[0].grants).toEqual({ liveCity: false, livePrecise: false, sonar: false })
  })
  it('grants and mute persist per friend', async () => {
    await useCrew.getState().add(marta)
    await useCrew.getState().setGrants(pid, { sonar: true })
    await useCrew.getState().mute(pid, NOW + 1000)
    const saved = (db.store.get('crew:friends') as Friend[])[0]
    expect(saved.grants).toEqual({ liveCity: false, livePrecise: false, sonar: true })
    expect(saved.mutedUntil).toBe(NOW + 1000)
  })
  it('remove sends a revoke to the room and forgets the friend and its fix', async () => {
    await useCrew.getState().add(marta)
    const sent: unknown[] = []
    useCrew.getState().setSender((p, m) => { sent.push([p, m]) })
    useCrew.getState().receive(fromMarta(ping()), NOW)
    expect(useCrew.getState().fixes[pid]).toBeTruthy()
    await useCrew.getState().remove(pid)
    expect(sent).toEqual([[pid, { type: 'revoke' }]])
    expect(useCrew.getState().friends).toEqual([])
    expect(useCrew.getState().fixes[pid]).toBeUndefined()
    expect(db.store.get('crew:friends')).toEqual([])
  })
})

describe('receive', () => {
  beforeEach(() => useCrew.getState().add(marta))
  it('a ping becomes the friend\'s last fix', () => {
    useCrew.getState().receive(fromMarta(ping()), NOW)
    expect(useCrew.getState().fixes[pid]).toMatchObject({ pairId: pid, lat: 38.72, lng: -9.14, city: 'Lisbon', grade: 'city', at: NOW })
  })
  it('an envelope from an unknown device or with a bad tag is ignored', () => {
    useCrew.getState().receive({ ...fromMarta(ping()), from: 'NOBODY' }, NOW)
    useCrew.getState().receive({ ...fromMarta(ping()), c: 'AAAA' }, NOW)
    expect(useCrew.getState().fixes).toEqual({})
  })
  it('stop clears the fix; revoke removes the friend too', async () => {
    useCrew.getState().receive(fromMarta(ping()), NOW)
    useCrew.getState().receive(fromMarta({ type: 'stop' }), NOW)
    expect(useCrew.getState().fixes).toEqual({})
    useCrew.getState().receive(fromMarta({ type: 'revoke' }), NOW)
    await vi.waitFor(() => expect(useCrew.getState().friends).toEqual([]))
    expect(db.store.get('crew:friends')).toEqual([])
  })
  it('a ping carrying a hit records one Sonar hit and sounds it once; muted friends stay silent', async () => {
    const heard = vi.fn(); sonarHooks.heard = heard
    useCrew.getState().receive(fromMarta(ping({ grade: 'sonar', hit: { id: `${pid}:1`, t: 1 } })), NOW)
    expect(useCrew.getState().hit).toEqual({ pairId: pid, id: `${pid}:1`, at: NOW })
    useCrew.getState().receive(fromMarta(ping({ grade: 'sonar', hit: { id: `${pid}:1`, t: 1 } })), NOW + 5000)
    expect(useCrew.getState().hit?.at).toBe(NOW)
    expect(heard).toHaveBeenCalledTimes(1)
    await useCrew.getState().mute(pid, NOW + 3600_000)
    useCrew.getState().receive(fromMarta(ping({ grade: 'sonar', hit: { id: `${pid}:2`, t: 2 } })), NOW + 6000)
    expect(heard).toHaveBeenCalledTimes(1)
    expect(useCrew.getState().hit?.id).toBe(`${pid}:1`)
  })
})

describe('visibleFixes', () => {
  const fix = (ageMs: number) => ({ pairId: pid, t: Math.floor((NOW - ageMs) / 1000), lat: 0, lng: 0, city: null, grade: 'city' as const, at: NOW - ageMs })
  it('fresh under 15 min, stale after, dropped after 24 h', () => {
    expect(STALE_MS).toBe(15 * 60_000); expect(DROP_MS).toBe(24 * 3600_000)
    expect(visibleFixes({ a: fix(60_000) }, NOW)).toEqual([{ ...fix(60_000), stale: false }])
    expect(visibleFixes({ a: fix(STALE_MS + 1) }, NOW)[0].stale).toBe(true)
    expect(visibleFixes({ a: fix(DROP_MS + 1) }, NOW)).toEqual([])
  })
  it('ageLabel reads like a person', () => {
    expect(ageLabel(Math.floor(NOW / 1000) - 10, NOW)).toBe('just now')
    expect(ageLabel(Math.floor(NOW / 1000) - 180, NOW)).toBe('3 min ago')
    expect(ageLabel(Math.floor(NOW / 1000) - 2 * 3600 - 10, NOW)).toBe('2 h ago')
  })
})
