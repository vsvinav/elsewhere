/**
 * Sonar: two friends, both sharing, within a mile, in a place that is home turf for neither, and at least the
 * newcomer away for a fortnight → one ping each. Pure functions; the Android twin is `sonar/Sonar.kt` with the same names.
 *
 * Approximation: the receiver evaluates its own habitat and absence around the friend's position (exact), while the
 * friend's self-reported `habitat` and `absenceDays` were computed around the friend's own position. The two circles
 * are ≤ 1 mile apart when it matters, so they overlap almost entirely.
 */
export const RADIUS_M = 1609
export const HABITAT_DAYS = 30
export const HABITAT_MIN_DAYS = 4
export const ABSENCE_MIN_DAYS = 14
export const DEBOUNCE_MS = 24 * 3600 * 1000
export const FRESH_MS = 10 * 60 * 1000

export interface Fix { ts: number; lat: number; lng: number }
/** One row per visit per local day it spans. */
export interface DayAt { localDay: string; lat: number; lng: number }
export interface Side { fix: Fix; habitat: boolean; absenceDays: number | null }
export interface Debounce { lastHitByPair: Record<string, number> }
export type Decision = { kind: 'quiet' } | { kind: 'fire'; hitId: string } | { kind: 'echo'; hitId: string }

const R = 6371e3, D2R = Math.PI / 180
export function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (b.lat - a.lat) * D2R, dLng = (b.lng - a.lng) * D2R
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
export const within = (a: { lat: number; lng: number }, b: { lat: number; lng: number }, r = RADIUS_M) => metres(a, b) <= r

// A cheap box test before the haversine: at 1609 m, 0.03° of latitude is more than enough.
const LAT_BOX = 0.03
const near = (row: { lat: number; lng: number }, at: Fix, cosLat: number) =>
  Math.abs(row.lat - at.lat) <= LAT_BOX && Math.abs(row.lng - at.lng) * cosLat <= LAT_BOX && within(row, at)

const DAY_MS = 86_400_000
const dayOf = (ts: number) => new Date(ts).toISOString().slice(0, 10)

/** ≥ `min` distinct local days within the radius of `at` in the last `days` days. One pass. */
export function isHabitat(history: DayAt[], at: Fix, now: number, days = HABITAT_DAYS, min = HABITAT_MIN_DAYS): boolean {
  const since = dayOf(now - days * DAY_MS)
  const cosLat = Math.cos(at.lat * D2R)
  const seen = new Set<string>()
  for (const row of history) {
    if (row.localDay < since || seen.has(row.localDay) || !near(row, at, cosLat)) continue
    seen.add(row.localDay)
    if (seen.size >= min) return true
  }
  return false
}

/** Days between the stint's start and the last nearby day before it. Null when never nearby before. */
export function absenceDays(history: DayAt[], at: Fix, stintStart: number): number | null {
  const startDay = dayOf(stintStart)
  const cosLat = Math.cos(at.lat * D2R)
  let last: string | null = null
  for (const row of history) {
    if (row.localDay >= startDay || (last && row.localDay <= last) || !near(row, at, cosLat)) continue
    last = row.localDay
  }
  if (!last) return null
  return Math.round((Date.parse(startDay) - Date.parse(last)) / DAY_MS)
}

/** Walks back from the newest fix while each is within the radius of `at`; now when there is none. */
export function stintStart(myFixes: Fix[], at: Fix): number {
  let start = at.ts
  for (let i = myFixes.length - 1; i >= 0; i--) {
    if (!within(myFixes[i], at)) break
    start = myFixes[i].ts
  }
  return start
}

/** The newcomer is whoever arrived later; null absence (never here) counts as infinite. */
export function newcomerAbsence(me: Side, friend: Side): number {
  const later = me.fix.ts >= friend.fix.ts ? me : friend
  return later.absenceDays ?? Infinity
}

export const eligible = (me: Side, friend: Side, now: number) =>
  now - me.fix.ts <= FRESH_MS && now - friend.fix.ts <= FRESH_MS &&
  within(me.fix, friend.fix) && !me.habitat && !friend.habitat &&
  newcomerAbsence(me, friend) >= ABSENCE_MIN_DAYS

export const debounced = (d: Debounce, pairId: string, now: number) => (d.lastHitByPair[pairId] ?? -Infinity) > now - DEBOUNCE_MS
export const recordHit = (d: Debounce, pairId: string, now: number): Debounce => ({ lastHitByPair: { ...d.lastHitByPair, [pairId]: now } })

/** The one entry point. `incomingHit` is the friend's `hit.id`, if any: the friend fired first, mirror it. */
export function decide(me: Side, friend: Side, pairId: string, now: number, d: Debounce, incomingHit: string | null): Decision {
  if (debounced(d, pairId, now)) return { kind: 'quiet' }
  if (incomingHit != null) return { kind: 'echo', hitId: incomingHit }
  if (eligible(me, friend, now)) return { kind: 'fire', hitId: `${pairId}:${now}` }
  return { kind: 'quiet' }
}
