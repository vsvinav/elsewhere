import type { Data } from '../data/types'
import { distanceKm } from '../analytics/position'

type P = [number, number]
export interface Hop { s: P; t: P; km: number; n: number }
export interface Port { p: P; name: string; n: number }

/** Routes flown (return legs merged) and the airports they join, named by the nearest visited city. */
export function flights(data: Data): { hops: Hop[]; ports: Port[] } {
  const hops = new Map<string, Hop>(), ports = new Map<string, Port>()
  const key = (p: P) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`
  // The city most visited within ~100 km of the runway: the airport's town is rarely where you slept.
  const nearCity = (lng: number, lat: number) => {
    const n = new Map<string, number>()
    for (const v of data.visits) {
      if (v.lvl !== 0 || Math.hypot((v.lng - lng) * Math.cos((lat * Math.PI) / 180), v.lat - lat) > 1) continue
      const c = data.places[v.place_id]?.city
      if (c) n.set(c, (n.get(c) ?? 0) + 1)
    }
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  }
  for (const a of data.activities) {
    if (a.mode !== 'FLYING' || a.m < 80_000) continue
    const s: P = [a.s_lng, a.s_lat], t: P = [a.e_lng, a.e_lat]
    const k = [key(s), key(t)].sort().join('|')
    const h = hops.get(k)
    if (h) h.n++
    else hops.set(k, { s, t, km: distanceKm({ lng: s[0], lat: s[1] }, { lng: t[0], lat: t[1] }), n: 1 })
    for (const p of [s, t]) {
      const pk = key(p), port = ports.get(pk)
      if (port) port.n++
      else ports.set(pk, { p, name: nearCity(p[0], p[1]), n: 1 })
    }
  }
  return { hops: [...hops.values()], ports: [...ports.values()].sort((a, b) => b.n - a.n) }
}

