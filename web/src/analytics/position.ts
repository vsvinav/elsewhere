import type { Data } from '../data/types'

export interface LngLat { lng: number; lat: number }

/** Best-guess location at time t: inside a visit → the place; inside an activity → linear interpolation; else last known. */
export function positionAt(data: Data, t: number): LngLat | null {
  let lastVisit: LngLat | null = null
  for (const v of data.visits) {
    if (v.start > t) break
    if (v.lvl !== 0) continue
    if (t <= v.end) return { lng: v.lng, lat: v.lat }
    lastVisit = { lng: v.lng, lat: v.lat }
  }
  for (const a of data.activities) {
    if (a.start > t) break
    if (t <= a.end) {
      const f = (t - a.start) / Math.max(1, a.end - a.start)
      return { lng: a.s_lng + (a.e_lng - a.s_lng) * f, lat: a.s_lat + (a.e_lat - a.s_lat) * f }
    }
  }
  return lastVisit
}

export function distanceKm(a: LngLat, b: LngLat): number {
  const r = 6371, p1 = (a.lat * Math.PI) / 180, p2 = (b.lat * Math.PI) / 180
  const dp = p2 - p1, dl = ((b.lng - a.lng) * Math.PI) / 180
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(h))
}
