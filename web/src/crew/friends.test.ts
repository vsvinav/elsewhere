import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ store: new Map<string, unknown>() }))
vi.mock('../ingest/db', () => ({ kv: { get: async (k: string) => db.store.get(k), set: async (k: string, v: unknown) => { db.store.set(k, v) }, del: async (k: string) => { db.store.delete(k) } } }))

import { DROP_MS, SEEN_HITS, SHEET_QUIET_MS, SHEET_SEEN_LS, STALE_MS, ageLabel, resetSeenHitsForTest, resetSheetSeenForTest, sonarHooks, useCrew, visibleFixes, type Friend, type Ping } from './friends'
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

const ls = new Map<string, string>()
vi.stubGlobal('localStorage', { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => ls.set(k, v), removeItem: (k: string) => ls.delete(k), clear: () => ls.clear() })

beforeEach(async () => {
  db.store.clear(); ls.clear()
  resetSeenHitsForTest(); resetSheetSeenForTest()
  setKeysForTest(A)
  useCrew.setState({ loaded: false, friends: [], fixes: {}, hit: null, sheetHit: null, sheetQuiet: {}, tag: null })
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
  it('replays and stale clocks are dropped: t must be a number, move forward, and sit within FRESH of now', () => {
    const r = useCrew.getState().receive
    r(fromMarta(ping({ t: 'soon' as unknown as number })), NOW)
    expect(useCrew.getState().fixes).toEqual({})
    r(fromMarta(ping({ t: Math.floor(NOW / 1000) - 11 * 60 })), NOW)
    r(fromMarta(ping({ t: Math.floor(NOW / 1000) + 11 * 60 })), NOW)
    expect(useCrew.getState().fixes).toEqual({})
    r(fromMarta(ping({ t: Math.floor(NOW / 1000) - 60, city: 'Lisbon' })), NOW)
    r(fromMarta(ping({ t: Math.floor(NOW / 1000) - 60, city: 'Replay' })), NOW + 1000)
    r(fromMarta(ping({ t: Math.floor(NOW / 1000) - 120, city: 'Older' })), NOW + 2000)
    expect(useCrew.getState().fixes[pid].city).toBe('Lisbon')
    r(fromMarta(ping({ t: Math.floor(NOW / 1000) - 30, city: 'Porto' })), NOW + 3000)
    expect(useCrew.getState().fixes[pid].city).toBe('Porto')
  })
  it('a hit id already seen is ignored, with a bounded memory of 64', () => {
    const heard = vi.fn(); sonarHooks.heard = heard
    const r = useCrew.getState().receive
    const t0 = Math.floor(NOW / 1000) - 300
    r(fromMarta(ping({ t: t0, hit: { id: 'h0', t: t0 } })), NOW)
    r(fromMarta(ping({ t: t0 + 1, hit: { id: 'h0', t: t0 } })), NOW)
    expect(heard).toHaveBeenCalledTimes(1)
    for (let i = 1; i <= SEEN_HITS; i++) r(fromMarta(ping({ t: t0 + 1 + i, hit: { id: `h${i}`, t: t0 } })), NOW)
    expect(heard).toHaveBeenCalledTimes(1 + SEEN_HITS)
    useCrew.getState().clearHit()
    r(fromMarta(ping({ t: t0 + 200, hit: { id: 'h0', t: t0 } })), NOW)
    expect(heard).toHaveBeenCalledTimes(2 + SEEN_HITS)
  })
  it('a ping carrying a hit records one Sonar hit and sounds it once; muted friends stay silent', async () => {
    const heard = vi.fn(); sonarHooks.heard = heard
    useCrew.getState().receive(fromMarta(ping({ grade: 'sonar', hit: { id: `${pid}:1`, t: 1 } })), NOW)
    expect(useCrew.getState().hit).toEqual({ pairId: pid, id: `${pid}:1`, at: NOW })
    useCrew.getState().receive(fromMarta(ping({ t: Math.floor(NOW / 1000) - 55, grade: 'sonar', hit: { id: `${pid}:1`, t: 1 } })), NOW + 5000)
    expect(useCrew.getState().hit?.at).toBe(NOW)
    expect(heard).toHaveBeenCalledTimes(1)
    await useCrew.getState().mute(pid, NOW + 3600_000)
    useCrew.getState().receive(fromMarta(ping({ t: Math.floor(NOW / 1000) - 50, grade: 'sonar', hit: { id: `${pid}:2`, t: 2 } })), NOW + 6000)
    expect(heard).toHaveBeenCalledTimes(1)
    expect(useCrew.getState().hit?.id).toBe(`${pid}:1`)
  })
})

describe('sonar sheet slot', () => {
  const sec = (ms: number) => Math.floor(ms / 1000)
  it('a hit fills the sheet slot as well, carrying the rehearsal flag; clearing the map note leaves the sheet alone', () => {
    sonarHooks.heard = vi.fn()
    useCrew.setState({ friends: [marta] })
    useCrew.getState().receive(fromMarta(ping({ grade: 'sonar', hit: { id: 'h1', t: 1, rehearsal: true } })), NOW)
    expect(useCrew.getState().hit).toEqual({ pairId: pid, id: 'h1', at: NOW, rehearsal: true })
    expect(useCrew.getState().sheetHit).toEqual({ pairId: pid, id: 'h1', at: NOW, rehearsal: true })
    useCrew.getState().clearHit()
    expect(useCrew.getState().hit).toBeNull()
    expect(useCrew.getState().sheetHit?.id).toBe('h1')
  })
  it('a showing sheet is never swapped for a newer hit; the map note still moves on', () => {
    sonarHooks.heard = vi.fn()
    useCrew.setState({ friends: [marta] })
    useCrew.getState().receive(fromMarta(ping({ t: sec(NOW) - 60, grade: 'sonar', hit: { id: 'h1', t: 1 } })), NOW)
    useCrew.getState().receive(fromMarta(ping({ t: sec(NOW) - 50, grade: 'sonar', hit: { id: 'h2', t: 2 } })), NOW + 1000)
    expect(useCrew.getState().hit?.id).toBe('h2')
    expect(useCrew.getState().sheetHit?.id).toBe('h1')
  })
  it('Dismiss empties the slot, remembers the id across reloads, and keeps that friend quiet for five minutes', () => {
    sonarHooks.heard = vi.fn()
    useCrew.setState({ friends: [marta] })
    useCrew.getState().receive(fromMarta(ping({ t: sec(NOW) - 60, grade: 'sonar', hit: { id: 'h1', t: 1 } })), NOW)
    useCrew.getState().dismissSheet(NOW)
    expect(useCrew.getState().sheetHit).toBeNull()
    expect(JSON.parse(ls.get(SHEET_SEEN_LS)!)).toEqual(['h1'])
    // Same id again after a reload: the ring guard is empty but the sheet still stays down.
    resetSeenHitsForTest()
    useCrew.getState().receive(fromMarta(ping({ t: sec(NOW) - 55, grade: 'sonar', hit: { id: 'h1', t: 1 } })), NOW + 1000)
    expect(useCrew.getState().sheetHit).toBeNull()
    // A fresh hit from the same friend inside the quiet window: note and ring, no sheet.
    useCrew.getState().receive(fromMarta(ping({ t: sec(NOW) - 50, grade: 'sonar', hit: { id: 'h2', t: 2 } })), NOW + 2000)
    expect(useCrew.getState().hit?.id).toBe('h2')
    expect(useCrew.getState().sheetHit).toBeNull()
    // Once the window passes the sheet may rise again.
    useCrew.getState().receive(fromMarta(ping({ t: sec(NOW) + 310, grade: 'sonar', hit: { id: 'h3', t: 3 } })), NOW + SHEET_QUIET_MS + 1)
    expect(useCrew.getState().sheetHit?.id).toBe('h3')
  })
  it('a test echo fills the slot too, and removing the friend empties it', async () => {
    sonarHooks.heard = vi.fn()
    useCrew.setState({ friends: [marta] })
    useCrew.getState().receive(fromMarta({ type: 'ping', t: sec(NOW), grade: 'sonar', lat: null, lng: null, city: null, habitat: false, absenceDays: 0, hit: { id: 'ab12cd34', t: sec(NOW), test: true }, test: true }), NOW)
    expect(useCrew.getState().sheetHit).toEqual({ pairId: pid, id: 'ab12cd34', at: NOW, test: true })
    await useCrew.getState().remove(pid)
    expect(useCrew.getState().sheetHit).toBeNull()
  })
})

describe('test fire', () => {
  it('a test ping with a hit rings as an echo without a position, is marked test, and still cannot ring twice', () => {
    const heard = vi.fn(); sonarHooks.heard = heard
    useCrew.setState({ friends: [marta] })
    useCrew.getState().receive(fromMarta({ type: 'ping', t: Math.floor(NOW / 1000), grade: 'sonar', lat: null, lng: null, city: null, habitat: false, absenceDays: 0, hit: { id: 'ab12cd34', t: Math.floor(NOW / 1000), test: true }, test: true }), NOW)
    expect(useCrew.getState().hit).toEqual({ pairId: pid, id: 'ab12cd34', at: NOW, test: true })
    expect(useCrew.getState().fixes[pid]).toBeUndefined()
    expect(heard).toHaveBeenCalledTimes(1)
    useCrew.getState().receive(fromMarta({ type: 'ping', t: Math.floor(NOW / 1000) + 1, grade: 'sonar', lat: null, lng: null, city: null, habitat: false, absenceDays: 0, hit: { id: 'ab12cd34', t: Math.floor(NOW / 1000), test: true }, test: true }), NOW + 1000)
    expect(heard).toHaveBeenCalledTimes(1)
    // Anything but `true` reads as a real ping, which needs a position.
    useCrew.getState().receive(fromMarta({ type: 'ping', t: Math.floor(NOW / 1000) + 2, grade: 'sonar', lat: null, lng: null, city: null, habitat: false, absenceDays: 0, hit: { id: 'ef56ab78', t: 1 }, test: 'yes' }), NOW + 2000)
    expect(heard).toHaveBeenCalledTimes(1)
  })
  it('testFire rings here, sends one test ping with the hit to that friend, and marks the hit seen', () => {
    const heard = vi.fn(); sonarHooks.heard = heard
    const sent: [string, Ping][] = []
    useCrew.setState({ friends: [{ ...marta, grants: { ...marta.grants, sonar: true } }] })
    useCrew.getState().setSender((p, m) => sent.push([p, m as Ping]))
    const hit = useCrew.getState().testFire(pid, NOW)
    expect(hit).toMatchObject({ id: expect.stringMatching(/^[0-9a-f]{8}$/), t: Math.floor(NOW / 1000), test: true })
    expect(useCrew.getState().hit).toEqual({ pairId: pid, id: hit!.id, at: NOW, test: true })
    expect(heard).toHaveBeenCalledTimes(1)
    expect(sent).toEqual([[pid, { type: 'ping', t: Math.floor(NOW / 1000), grade: 'sonar', lat: null, lng: null, city: null, habitat: false, absenceDays: 0, hit, test: true }]])
    useCrew.getState().clearHit()
    useCrew.getState().receive(fromMarta({ ...sent[0][1], t: Math.floor(NOW / 1000) + 1 }), NOW + 1000)
    expect(useCrew.getState().hit).toBeNull()
    expect(heard).toHaveBeenCalledTimes(1)
    useCrew.getState().setSender(null)
  })
})

describe('visibleFixes', () => {
  const fix = (ageMs: number) => ({ pairId: pid, t: Math.floor((NOW - ageMs) / 1000), lat: 0, lng: 0, city: null, grade: 'city' as const, at: NOW })
  it('fresh under 15 min, stale after, dropped after 24 h, all by the sender clock', () => {
    expect(STALE_MS).toBe(15 * 60_000); expect(DROP_MS).toBe(24 * 3600_000)
    expect(visibleFixes({ a: fix(60_000) }, NOW)).toEqual([{ ...fix(60_000), stale: false }])
    expect(visibleFixes({ a: fix(STALE_MS + 1) }, NOW)[0].stale).toBe(true)
    expect(visibleFixes({ a: fix(DROP_MS + 1000) }, NOW)).toEqual([])
    expect(visibleFixes({ a: { ...fix(60_000), at: NOW - DROP_MS * 2 } }, NOW)[0].stale).toBe(false)
  })
  it('ageLabel reads like a person', () => {
    expect(ageLabel(Math.floor(NOW / 1000) - 10, NOW)).toBe('just now')
    expect(ageLabel(Math.floor(NOW / 1000) - 180, NOW)).toBe('3 min ago')
    expect(ageLabel(Math.floor(NOW / 1000) - 2 * 3600 - 10, NOW)).toBe('2 h ago')
  })
})
