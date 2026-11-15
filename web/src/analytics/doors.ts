import type { Place } from '../data/types'

/** The most visited pin in each group, so a count of countries or cities opens as that many pins. O(P). */
function topPer(places: Record<string, Place>, key: (p: Place) => string | null): string[] {
  const best = new Map<string, [string, number]>()
  for (const [id, p] of Object.entries(places)) {
    const k = key(p)
    if (!k) continue
    const cur = best.get(k)
    if (!cur || p.n_visits > cur[1]) best.set(k, [id, p.n_visits])
  }
  return [...best.values()].map(([id]) => id)
}

export const onePerCountry = (places: Record<string, Place>) => topPer(places, (p) => p.country_code)
export const onePerCity = (places: Record<string, Place>) => topPer(places, (p) => p.city)
/** O(P); for many cities at once use `cityIndex`. */
export const placesInCity = (places: Record<string, Place>, city: string) => Object.entries(places).filter(([, p]) => p.city === city).map(([id]) => id)

/** The local day around `ts`, as UTC seconds; `tz` in minutes east. */
export function dayRange(ts: number, tz: number): [number, number] {
  const off = tz * 60
  const start = Math.floor((ts + off) / 86400) * 86400 - off
  return [start, start + 86400 - 1]
}

/** A `YYYY-MM` key as a UTC window. */
export function monthRange(key: string): [number, number] {
  const [y, m] = key.split('-').map(Number)
  return [Date.UTC(y, m - 1, 1) / 1000, Date.UTC(y, m, 1) / 1000 - 1]
}

/** A `YYYY-MM-DD` key as a UTC window. */
export function dateRange(key: string): [number, number] {
  const start = Date.parse(key + 'T00:00:00Z') / 1000
  return [start, start + 86400 - 1]
}

export const tripId = (t: { start: number; end: number }) => `${t.start}-${t.end}`

/** Every pin in each city, built once per record so a table of cities does not rescan the place book per row. O(P). */
export function cityIndex(places: Record<string, Place>): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const [id, p] of Object.entries(places)) {
    if (!p.city) continue
    const list = out.get(p.city)
    if (list) list.push(id); else out.set(p.city, [id])
  }
  return out
}
