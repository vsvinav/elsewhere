import type { Data } from '../data/types'

export interface LngLat { lng: number; lat: number }
/** Where you are and how you are moving at time t. mode is 'STILL' inside a visit. */
export interface Whereabouts extends LngLat { mode: string }

export function whereaboutsAt(data: Data, t: number): Whereabouts | null {
  let lastVisit: Whereabouts | null = null
  for (const v of data.visits) {
    if (v.start > t) break
    if (v.lvl !== 0) continue
    if (t <= v.end) return { lng: v.lng, lat: v.lat, mode: 'STILL' }
    lastVisit = { lng: v.lng, lat: v.lat, mode: 'STILL' }
  }
  for (const a of data.activities) {
    if (a.start > t) break
    if (t <= a.end) {
      const f = (t - a.start) / Math.max(1, a.end - a.start)
      return { lng: a.s_lng + (a.e_lng - a.s_lng) * f, lat: a.s_lat + (a.e_lat - a.s_lat) * f, mode: a.mode }
    }
  }
  return lastVisit
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

/** Camera zoom that frames the current kind of movement. */
export function zoomForMode(mode: string): number {
  switch (mode) {
    case 'FLYING': return 4.5
    case 'IN_TRAIN': case 'IN_FERRY': return 10
    case 'IN_PASSENGER_VEHICLE': case 'MOTORCYCLING': case 'IN_BUS': case 'IN_SUBWAY': case 'IN_TRAM': return 12
    case 'CYCLING': return 13.5
    case 'WALKING': case 'RUNNING': return 15
    case 'STILL': return 14
    default: return 12
  }
}

export function distanceKm(a: LngLat, b: LngLat): number {
  const r = 6371, p1 = (a.lat * Math.PI) / 180, p2 = (b.lat * Math.PI) / 180
  const dp = p2 - p1, dl = ((b.lng - a.lng) * Math.PI) / 180
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(h))
}
