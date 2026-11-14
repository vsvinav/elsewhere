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
