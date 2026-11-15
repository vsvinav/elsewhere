import type { Place } from '../data/types'

/** The most visited pin in each group, so a count of countries or cities opens as that many pins. */
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
