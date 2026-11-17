// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
vi.hoisted(() => {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) })
})
const db = vi.hoisted(() => ({ store: new Map<string, unknown>() }))
vi.mock('../ingest/db', () => ({ kv: { get: async (k: string) => db.store.get(k), set: async (k: string, v: unknown) => { db.store.set(k, v) }, del: async (k: string) => { db.store.delete(k) } } }))

import { useRooms } from './useRooms'
import { resetSeenHitsForTest, sonarHooks, useCrew, type Friend } from './friends'
import { deviceIdOf, fromHex, keysFromSeeds, open, pairIdOf, pairKeyOf, seal, setKeysForTest, toHex, type Envelope } from './keys'
import { settings } from '../ingest/settings'
import { useStore } from '../store/useStore'
import vectors from './vectors.json'

const A = keysFromSeeds(fromHex(vectors.a.signSeed), fromHex(vectors.a.kxSeed))
const B = keysFromSeeds(fromHex(vectors.b.signSeed), fromHex(vectors.b.kxSeed))
const pid = pairIdOf(A.signPub, B.signPub)
const key = pairKeyOf(A.kxPriv, B.kxPub, pid)
const marta: Friend = { deviceId: deviceIdOf(B.signPub), name: 'Marta', signPub: toHex(B.signPub), kxPub: toHex(B.kxPub), pairId: pid, pairKey: toHex(key), addedAt: 1, grants: { liveCity: true, livePrecise: false, sonar: false } }
const ping = seal(key, pid, marta.deviceId, { type: 'ping', t: Math.floor(Date.now() / 1000), grade: 'city', lat: 38.7, lng: -9.1, city: 'Lisbon', habitat: false, absenceDays: null, hit: null })

const sockets: FakeWS[] = []
class FakeWS { url: string; readyState = 0; onopen: (() => void) | null = null; onmessage: ((e: { data: string }) => void) | null = null; onclose: (() => void) | null = null; sent: string[] = []; closed = false; constructor(url: string) { this.url = url; sockets.push(this) } send(s: string) { this.sent.push(s) } close() { this.closed = true; this.readyState = 3; this.onclose?.() } }
const lastCalls: string[] = []
let lastAnswer: Envelope = ping
const fetchFn = (async (input: RequestInfo | URL) => { lastCalls.push(new URL(String(input)).pathname); return Response.json([lastAnswer]) }) as typeof fetch

function Probe() { useRooms({ WS: FakeWS as unknown as typeof WebSocket, fetchFn }); return null }
const mount = () => {
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  act(() => root.render(createElement(Probe)))
  return { flush: () => act(() => new Promise((r) => setTimeout(r, 20))), unmount: () => act(() => root.unmount()) }
}

beforeEach(async () => {
  db.store.clear(); sockets.length = 0; lastCalls.length = 0; lastAnswer = ping
  setKeysForTest(A)
  settings.set({ relayUrl: 'https://relay.test' })
  useStore.setState({ tab: 'home', settingsOpen: false })
  useCrew.setState({ loaded: false, friends: [marta], fixes: {}, hit: null, tag: null })
  db.store.set('crew:friends', [marta])
  resetSeenHitsForTest()
})
afterEach(() => useCrew.getState().setSender(null))

describe('useRooms', () => {
  it('connects only while the Map tab is open, seeds from /last, feeds live envelopes, and closes on leaving', async () => {
    const { flush, unmount } = mount()
    await flush()
    expect(sockets).toHaveLength(0)
    act(() => useStore.getState().setTab('map'))
    await flush()
    expect(sockets).toHaveLength(1)
    expect(lastCalls).toEqual([`/room/${pid}/last`])
    expect(useCrew.getState().fixes[pid]).toMatchObject({ city: 'Lisbon' })
    useCrew.setState({ fixes: {} })
    act(() => sockets[0].onmessage?.({ data: JSON.stringify(ping) }))
    expect(useCrew.getState().fixes[pid]).toMatchObject({ city: 'Lisbon' })
    act(() => useStore.getState().setTab('stats'))
    await flush()
    expect(sockets[0].closed).toBe(true)
    unmount()
  })
  it('a hit already heard and cleared does not ring again when /last re-seeds the room', async () => {
    const heard = vi.spyOn(sonarHooks, 'heard').mockImplementation(() => {})
    const t = Math.floor(Date.now() / 1000) + 1
    const hit = seal(key, pid, marta.deviceId, { type: 'ping', t, grade: 'sonar', lat: 38.7, lng: -9.1, city: 'Lisbon', habitat: false, absenceDays: 200, hit: { id: 'h1', t } })
    const { flush, unmount } = mount()
    act(() => useStore.getState().setTab('map'))
    await flush()
    act(() => sockets[0].onmessage?.({ data: JSON.stringify(hit) }))
    expect(useCrew.getState().hit).toMatchObject({ pairId: pid, id: 'h1' })
    expect(heard).toHaveBeenCalledTimes(1)
    act(() => useCrew.getState().clearHit())
    useCrew.setState({ fixes: {} })
    lastAnswer = hit
    act(() => useStore.getState().setTab('stats'))
    await flush()
    act(() => useStore.getState().setTab('map'))
    await flush()
    expect(lastCalls).toEqual([`/room/${pid}/last`, `/room/${pid}/last`])
    expect(useCrew.getState().fixes[pid]).toMatchObject({ city: 'Lisbon' })
    expect(useCrew.getState().hit).toBeNull()
    expect(heard).toHaveBeenCalledTimes(1)
    unmount()
  })
  it('the Crew tab keeps the rooms open too, so a live dot and a pairing can land there', async () => {
    const { flush, unmount } = mount()
    act(() => useStore.getState().setTab('crew'))
    await flush()
    expect(sockets).toHaveLength(1)
    expect(sockets[0].closed).toBe(false)
    act(() => useStore.getState().setTab('home'))
    await flush()
    expect(sockets[0].closed).toBe(true)
    unmount()
  })
  it('a revoke from Crew is sealed for the pair and sent down the open socket', async () => {
    useStore.setState({ tab: 'map' })
    const { flush, unmount } = mount()
    await flush()
    sockets[0].readyState = 1
    await act(() => useCrew.getState().remove(pid))
    const env = JSON.parse(sockets[0].sent[0]) as Envelope
    expect(env.from).toBe(deviceIdOf(A.signPub))
    expect(open(key, pid, env)).toEqual({ type: 'revoke' })
    unmount()
  })
  it('with no friends nothing is dialled', async () => {
    useCrew.setState({ friends: [] }); db.store.set('crew:friends', [])
    useStore.setState({ tab: 'map' })
    const { flush, unmount } = mount()
    await flush()
    expect(sockets).toHaveLength(0)
    unmount()
  })
})
