import type { Data } from '../data/types'
import { legsOf } from './legs'

export interface LngLat { lng: number; lat: number }
/** Where you are and how you are moving at time t. mode is 'STILL' inside a visit. */
export interface Whereabouts extends LngLat { mode: string; heading: number }

/** Degrees clockwise from north, a → b. */
export function bearing(a: LngLat, b: LngLat): number {
  const r = Math.PI / 180, f1 = a.lat * r, f2 = b.lat * r, dl = (b.lng - a.lng) * r
  const y = Math.sin(dl) * Math.cos(f2), x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl)
  return ((Math.atan2(y, x) / r) + 360) % 360
}

const TOP = new WeakMap<Data, Data['visits']>()
/** Index of the last item with start <= t, or -1. Items are sorted by start. */
function lastStarted(items: { start: number }[], t: number): number { return lastLE(items.length, (i) => items[i].start, t) }
function lastLE(n: number, at: (i: number) => number, t: number): number {
  let lo = 0, hi = n - 1, out = -1
  while (lo <= hi) { const m = (lo + hi) >> 1; if (at(m) <= t) { out = m; lo = m + 1 } else hi = m - 1 }
  return out
}
const topVisits = (data: Data) => { let v = TOP.get(data); if (!v) TOP.set(data, (v = data.visits.filter((x) => x.lvl === 0))); return v }
export function whereaboutsAt(data: Data, t: number): Whereabouts | null {
  const visits = topVisits(data)
  const vi = lastStarted(visits, t)
  if (vi >= 0 && t <= visits[vi].end) { const v = visits[vi]; return { lng: v.lng, lat: v.lat, mode: 'STILL', heading: 0 } }
  const ai = lastStarted(data.activities, t)
  if (ai >= 0 && t <= data.activities[ai].end) {
    // Same line the map draws, so the marker sits exactly on the head of the trail.
    const { path, ts, mode } = legsOf(data)[ai]
    const k = Math.min(ts.length - 1, Math.max(1, lastLE(ts.length, (i) => ts[i], t) + 1))
    const [x0, y0] = path[k - 1], [x1, y1] = path[k]
    const f = Math.min(1, Math.max(0, (t - ts[k - 1]) / Math.max(1, ts[k] - ts[k - 1])))
    return { lng: x0 + (x1 - x0) * f, lat: y0 + (y1 - y0) * f, mode, heading: bearing({ lng: x0, lat: y0 }, { lng: x1, lat: y1 }) }
  }
  if (vi >= 0) { const v = visits[vi]; return { lng: v.lng, lat: v.lat, mode: 'STILL', heading: 0 } }
  return null
}

export interface Segment { kind: 'visit' | 'activity' | 'gap'; start: number; end: number; s: LngLat; e: LngLat; mode: string; km: number }

/** The visit, activity or gap the playhead is inside, with both ends so a camera can frame it. Binary search: safe to call hundreds of times a frame. */
export function segmentAt(data: Data, t: number): Segment {
  const visits = topVisits(data), acts = data.activities
  const vi = lastStarted(visits, t), ai = lastStarted(acts, t)
  if (vi >= 0 && t <= visits[vi].end) { const v = visits[vi]; return { kind: 'visit', start: v.start, end: v.end, s: v, e: v, mode: 'STILL', km: 0 } }
  if (ai >= 0 && t <= acts[ai].end) { const a = acts[ai]; return { kind: 'activity', start: a.start, end: a.end, s: { lng: a.s_lng, lat: a.s_lat }, e: { lng: a.e_lng, lat: a.e_lat }, mode: a.mode, km: a.m / 1000 } }
  const pv = vi >= 0 ? visits[vi] : null, pa = ai >= 0 ? acts[ai] : null
  const prevEnd = Math.max(pv?.end ?? -Infinity, pa?.end ?? -Infinity)
  const prev: LngLat | null = pv && pa ? (pv.end >= pa.end ? pv : { lng: pa.e_lng, lat: pa.e_lat }) : pv ?? (pa ? { lng: pa.e_lng, lat: pa.e_lat } : null)
  const nv = visits[vi + 1], na = acts[ai + 1]
  const next = nv && (!na || nv.start <= na.start) ? { start: nv.start, p: nv as LngLat } : na ? { start: na.start, p: { lng: na.s_lng, lat: na.s_lat } } : null
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
