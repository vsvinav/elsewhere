// Friends: who is paired, what each may see, and the last fix each has sent.
import { create } from 'zustand'
import { kv } from '../ingest/db'
import { FRESH_MS } from '../sonar/sonar'
import { sonarHeard } from '../sonar/ping'
import { fromHex, open, seal, toHex, type Envelope } from './keys'
import { randomBytes } from '@noble/hashes/utils.js'

export interface Grants { liveCity: boolean; livePrecise: boolean; sonar: boolean }
export interface Friend {
  deviceId: string; name: string; signPub: string; kxPub: string
  pairId: string; pairKey: string; addedAt: number
  grants: Grants; mutedUntil?: number
}
export type Grade = 'city' | 'precise' | 'sonar'
/** `test` marks a Test Sonar ping: it rings on both sides whatever the distance, carries no position and is never recorded. */
export interface Ping { type: 'ping'; t: number; grade: Grade; lat: number | null; lng: number | null; city: string | null; habitat: boolean; absenceDays: number; hit: { id: string; t: number; test?: true; rehearsal?: boolean } | null; test?: true }
export type Message = Ping | { type: 'stop' } | { type: 'revoke' }
/** A friend's last known position; `t` is the sender's clock and drives staleness, `at` is when this browser received it. */
export interface Fix { pairId: string; t: number; lat: number; lng: number; city: string | null; grade: Grade; at: number }
/** `rehearsal` is set by the sender when the ping fired under its rehearsal switch. */
export interface Hit { pairId: string; id: string; at: number; test?: true; rehearsal?: true }

export const FRIENDS_KV = 'crew:friends'
export const STALE_MS = 15 * 60_000
export const DROP_MS = 24 * 3600_000
/** Sonar hit ids already acted on; a replayed envelope cannot ring twice. */
export const SEEN_HITS = 64
const seenHits: string[] = []
const seenHit = (id: string) => { if (seenHits.includes(id)) return true; seenHits.push(id); if (seenHits.length > SEEN_HITS) seenHits.shift(); return false }
export const resetSeenHitsForTest = () => { seenHits.length = 0 }
/** Hit ids whose sheet was put away, kept across reloads so a re-seeded room cannot raise it again. */
export const SHEET_SEEN_LS = 'sonar:sheetSeen'
/** After Dismiss, no new sheet for the same friend for a while; the map note and the ring still happen. */
export const SHEET_QUIET_MS = 5 * 60_000
const readSheetSeen = (): string[] => { try { const v = JSON.parse(localStorage.getItem(SHEET_SEEN_LS) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [] } catch { return [] } }
let sheetSeen = readSheetSeen()
const sheetSeenAdd = (id: string) => {
  if (sheetSeen.includes(id)) return
  sheetSeen = [...sheetSeen, id].slice(-SEEN_HITS)
  try { localStorage.setItem(SHEET_SEEN_LS, JSON.stringify(sheetSeen)) } catch { /* private mode */ }
}
export const resetSheetSeenForTest = () => { sheetSeen = [] }
export type Sender = (pairId: string, m: Message) => void
/** Replaceable so tests and the map can watch for hits without an AudioContext. */
export const sonarHooks = { heard: (): void => { if (typeof document !== 'undefined') sonarHeard() } }

interface CrewState {
  loaded: boolean
  friends: Friend[]
  fixes: Record<string, Fix>
  hit: Hit | null
  /** The hit the Sonar sheet is showing. Only the sheet's Dismiss empties it, so the map note's own clock cannot pull the sheet down mid-photo. */
  sheetHit: Hit | null
  /** Per pair, when a dismissed sheet may rise again. */
  sheetQuiet: Record<string, number>
  /** Pair id of the friend whose tag is showing on the map. */
  tag: string | null
  load(): Promise<void>
  add(f: Friend): Promise<void>
  setGrants(pairId: string, g: Partial<Grants>): Promise<void>
  mute(pairId: string, until: number | undefined): Promise<void>
  remove(pairId: string): Promise<void>
  setSender(s: Sender | null): void
  receive(e: Envelope, now?: number): void
  setTag(pairId: string | null): void
  clearHit(): void
  dismissSheet(now?: number): void
  /** Test Sonar: ring here and send the same hit to one friend, so both ends can be checked from one room. */
  testFire(pairId: string, now?: number): Ping['hit']
}

let sender: Sender | null = null
const save = (friends: Friend[]) => kv.set(FRIENDS_KV, friends)
const isFriend = (f: unknown): f is Friend => !!f && typeof (f as Friend).pairId === 'string' && typeof (f as Friend).pairKey === 'string'

export const useCrew = create<CrewState>((set, get) => ({
  loaded: false, friends: [], fixes: {}, hit: null, sheetHit: null, sheetQuiet: {}, tag: null,
  load: async () => {
    const raw = await kv.get<Friend[]>(FRIENDS_KV)
    set({ loaded: true, friends: Array.isArray(raw) ? raw.filter(isFriend) : [] })
  },
  add: async (f) => {
    const friends = [...get().friends.filter((x) => x.pairId !== f.pairId), f]
    set({ friends }); await save(friends)
  },
  setGrants: async (pairId, g) => {
    const friends = get().friends.map((f) => (f.pairId === pairId ? { ...f, grants: { ...f.grants, ...g } } : f))
    set({ friends }); await save(friends)
  },
  mute: async (pairId, until) => {
    const friends = get().friends.map((f) => (f.pairId === pairId ? { ...f, mutedUntil: until } : f))
    set({ friends }); await save(friends)
  },
  remove: async (pairId) => {
    const f = get().friends.find((x) => x.pairId === pairId)
    if (f && sender) sender(pairId, { type: 'revoke' })
    forget(pairId)
    await save(get().friends)
  },
  setSender: (s) => { sender = s },
  receive: (e, now = Date.now()) => {
    const f = get().friends.find((x) => x.deviceId === e.from)
    if (!f) return
    let m: Message
    try { m = open<Message>(fromHex(f.pairKey), f.pairId, e) } catch { return }
    if (!m || typeof m !== 'object') return
    if (m.type === 'stop') { const { [f.pairId]: _, ...fixes } = get().fixes; set({ fixes }); return }
    if (m.type === 'revoke') { forget(f.pairId); void save(get().friends); return }
    if (m.type !== 'ping' || typeof m.t !== 'number') return
    const test = m.test === true
    if (!test && (typeof m.lat !== 'number' || typeof m.lng !== 'number')) return
    const s = get()
    // Replay guard: sender time must move forward for the pair and sit near our clock.
    const last = s.fixes[f.pairId]
    if ((last && m.t <= last.t) || Math.abs(now / 1000 - m.t) > FRESH_MS / 1000) return
    const muted = (f.mutedUntil ?? 0) > now
    const hit = m.hit && typeof m.hit.id === 'string' && !seenHit(m.hit.id) ? m.hit : null
    const fresh = !!hit && !muted
    const next = fresh && hit ? { pairId: f.pairId, id: hit.id, at: now, ...(test ? { test: true as const } : {}), ...(hit.rehearsal === true ? { rehearsal: true as const } : {}) } : s.hit
    const sheetHit = fresh && hit && !s.sheetHit && !sheetSeen.includes(hit.id) && (s.sheetQuiet[f.pairId] ?? 0) <= now ? next : s.sheetHit
    // A test ping carries no position: it only rings. A real one moves the stamp.
    if (test) set({ hit: next, sheetHit })
    else set({ fixes: { ...s.fixes, [f.pairId]: { pairId: f.pairId, t: m.t, lat: m.lat as number, lng: m.lng as number, city: m.city ?? null, grade: m.grade, at: now } }, hit: next, sheetHit })
    if (fresh) sonarHooks.heard()
  },
  setTag: (pairId) => set({ tag: pairId }),
  clearHit: () => set({ hit: null }),
  dismissSheet: (now = Date.now()) => {
    const h = get().sheetHit
    if (!h) return
    sheetSeenAdd(h.id)
    set({ sheetHit: null, sheetQuiet: { ...get().sheetQuiet, [h.pairId]: now + SHEET_QUIET_MS } })
  },
  testFire: (pairId, now = Date.now()) => {
    const f = get().friends.find((x) => x.pairId === pairId)
    if (!f || !sender) return null
    const t = Math.floor(now / 1000)
    const hit = { id: toHex(randomBytes(4)), t, test: true as const }
    seenHit(hit.id)
    const mine: Hit = { pairId, id: hit.id, at: now, test: true }
    set({ hit: mine, sheetHit: get().sheetHit ?? mine })
    sonarHooks.heard()
    sender(pairId, { type: 'ping', t, grade: 'sonar', lat: null, lng: null, city: null, habitat: false, absenceDays: 0, hit, test: true })
    return hit
  },
}))

/** Drops a friend and every trace of them from memory; the caller persists. */
function forget(pairId: string) {
  const s = useCrew.getState()
  const { [pairId]: _, ...fixes } = s.fixes
  useCrew.setState({ friends: s.friends.filter((f) => f.pairId !== pairId), fixes, tag: s.tag === pairId ? null : s.tag, hit: s.hit?.pairId === pairId ? null : s.hit, sheetHit: s.sheetHit?.pairId === pairId ? null : s.sheetHit })
}

export const sealFor = (f: Friend, from: string, m: Message) => seal(fromHex(f.pairKey), f.pairId, from, m)

export function visibleFixes(fixes: Record<string, Fix>, now: number): (Fix & { stale: boolean })[] {
  const out: (Fix & { stale: boolean })[] = []
  for (const f of Object.values(fixes)) {
    const age = now - f.t * 1000
    if (age > DROP_MS) continue
    out.push({ ...f, stale: age > STALE_MS })
  }
  return out
}

/** Someone's fix is fresher than the stale line: the Crew tab wears its live dot. */
export const anyLive = (fixes: Record<string, Fix>, now: number) => Object.values(fixes).some((f) => now - f.t * 1000 <= STALE_MS)

export function ageLabel(t: number, now: number): string {
  const s = Math.max(0, Math.floor(now / 1000) - t)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86_400)} d ago`
}

/** Local midnight after `now`, for "Mute until tomorrow". */
export function nextMidnight(now: number): number {
  const d = new Date(now); d.setHours(24, 0, 0, 0); return d.getTime()
}
