import type { Data } from '../data/types'

export interface LngLat { lng: number; lat: number }
/** Where you are and how you are moving at time t. mode is 'STILL' inside a visit. */
export interface Whereabouts extends LngLat { mode: string; heading: number }

/** Degrees clockwise from north, a → b. */
export function bearing(a: LngLat, b: LngLat): number {
  const r = Math.PI / 180, f1 = a.lat * r, f2 = b.lat * r, dl = (b.lng - a.lng) * r
  const y = Math.sin(dl) * Math.cos(f2), x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl)
  return ((Math.atan2(y, x) / r) + 360) % 360
}

interface Index { visits: Data['visits']; pathOf: Map<number, Data['paths'][number]> }
const INDEX = new WeakMap<Data, Index>()
/** Top-level visits only, and the GPS path that runs inside each activity (by index), so a drive follows the road. */
function index(data: Data): Index {
  let ix = INDEX.get(data)
  if (!ix) {
    const pathOf = new Map<number, Data['paths'][number]>()
    let ai = 0
    for (const p of data.paths ?? []) {
      const mid = (p.start + p.end) / 2
      while (ai < data.activities.length && data.activities[ai].end < mid) ai++
      const a = data.activities[ai]
      if (a && a.start <= mid && p.pts.length > 1) pathOf.set(ai, p)
    }
    INDEX.set(data, (ix = { visits: data.visits.filter((v) => v.lvl === 0), pathOf }))
  }
  return ix
}
/** Index of the last item with start <= t, or -1. Items are sorted by start. */
function lastStarted(items: { start: number }[], t: number): number { return lastLE(items.length, (i) => items[i].start, t) }
function lastLE(n: number, at: (i: number) => number, t: number): number {
  let lo = 0, hi = n - 1, out = -1
  while (lo <= hi) { const m = (lo + hi) >> 1; if (at(m) <= t) { out = m; lo = m + 1 } else hi = m - 1 }
  return out
}

export function whereaboutsAt(data: Data, t: number): Whereabouts | null {
  const ix = index(data)
  const vi = lastStarted(ix.visits, t)
  if (vi >= 0 && t <= ix.visits[vi].end) { const v = ix.visits[vi]; return { lng: v.lng, lat: v.lat, mode: 'STILL', heading: 0 } }
  const ai = lastStarted(data.activities, t)
  if (ai >= 0 && t <= data.activities[ai].end) {
    const a = data.activities[ai], path = ix.pathOf.get(ai)
    if (path) {
      const pts = path.pts, k = Math.max(1, lastLE(pts.length, (i) => pts[i][0], t))
      const [t0, la0, ln0] = pts[k - 1], [t1, la1, ln1] = pts[Math.min(k, pts.length - 1)]
      const f = Math.min(1, Math.max(0, (t - t0) / Math.max(1, t1 - t0)))
      const here = { lng: ln0 + (ln1 - ln0) * f, lat: la0 + (la1 - la0) * f }
      return { ...here, mode: a.mode, heading: bearing({ lng: ln0, lat: la0 }, { lng: ln1, lat: la1 }) }
    }
    const f = (t - a.start) / Math.max(1, a.end - a.start), s = { lng: a.s_lng, lat: a.s_lat }, e = { lng: a.e_lng, lat: a.e_lat }
    return { lng: s.lng + (e.lng - s.lng) * f, lat: s.lat + (e.lat - s.lat) * f, mode: a.mode, heading: bearing(s, e) }
  }
  if (vi >= 0) { const v = ix.visits[vi]; return { lng: v.lng, lat: v.lat, mode: 'STILL', heading: 0 } }
  return null
}

export interface Segment { kind: 'visit' | 'activity' | 'gap'; start: number; end: number; s: LngLat; e: LngLat; mode: string; km: number }

/** The visit, activity or gap the playhead is inside, with both ends so a camera can frame it. */
export function segmentAt(data: Data, t: number): Segment {
  type Next = { start: number; p: LngLat }
  let prev: LngLat | null = null, next: Next | null = null, prevEnd = -Infinity
  for (const v of data.visits) {
    if (v.lvl !== 0) continue
    if (v.start > t) { next = { start: v.start, p: v }; break }
    if (t <= v.end) return { kind: 'visit', start: v.start, end: v.end, s: v, e: v, mode: 'STILL', km: 0 }
    if (v.end > prevEnd) { prevEnd = v.end; prev = v }
  }
  for (const a of data.activities) {
    if (a.start > t) { const n: Next | null = next; if (!n || a.start < n.start) next = { start: a.start, p: { lng: a.s_lng, lat: a.s_lat } }; break }
    const s = { lng: a.s_lng, lat: a.s_lat }, e = { lng: a.e_lng, lat: a.e_lat }
    if (t <= a.end) return { kind: 'activity', start: a.start, end: a.end, s, e, mode: a.mode, km: a.m / 1000 }
    if (a.end > prevEnd) { prevEnd = a.end; prev = e }
  }
  const s = prev ?? next?.p ?? data.profile.home, e = next?.p ?? s
  const start = Number.isFinite(prevEnd) ? prevEnd : Math.min(t, data.meta.range[0])
  return { kind: 'gap', start, end: next?.start ?? t + 6 * 3600, s, e, mode: 'GAP', km: distanceKm(s, e) }
}

export function positionAt(data: Data, t: number): LngLat | null {
  const w = whereaboutsAt(data, t)
  return w && { lng: w.lng, lat: w.lat }
}

export function distanceKm(a: LngLat, b: LngLat): number {
  const r = 6371, p1 = (a.lat * Math.PI) / 180, p2 = (b.lat * Math.PI) / 180
  const dp = p2 - p1, dl = ((b.lng - a.lng) * Math.PI) / 180
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(h))
}
