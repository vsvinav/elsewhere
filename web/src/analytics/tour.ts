import type { Data, Visit } from '../data/types'
import { isHome } from './geo'
import { homeAt } from '../profile/profile'
import { distanceKm } from './position'

export interface Stop { city: string; country: string | null; nights: number; visits: number; first: number; last: number; lat: number; lng: number; /** Every bed slept in there. */ placeIds: string[] }
export interface HeadlineAct { city: string; country: string | null; km: number; nights: number; start: number; end: number; place_id: string }
export interface Tour {
  stops: Stop[]
  nightsAway: number
  nightsHome: number
  headline: HeadlineAct | null
  years: [number, number]
}

const NIGHT_HOUR = 3

/** Local 03:00 instants inside [start, end]: one per night slept there. */
export function nightsIn(v: Pick<Visit, 'start' | 'end' | 'tz'>): number {
  const off = v.tz * 60
  const first = Math.ceil((v.start + off - NIGHT_HOUR * 3600) / 86400) * 86400 + NIGHT_HOUR * 3600 - off
  if (first > v.end) return 0
  return Math.floor((v.end - first) / 86400) + 1
}

/** Where home was at `ts`: the declared home for that period, or the record's one derived home. */
export const homeOf = (data: Data, ts: number): { lat: number; lng: number } => data.profile.homes?.length ? homeAt(data.profile.homes, ts) : data.profile.home

/** A night's sleep away from home: a lvl-0 visit that spans at least one local 03:00 and sits off the home radius. */
export interface Sleep { v: Visit; nights: number }

/** Every visit slept away from home, in record order, with its nights. */
export function sleptAway(data: Data): { away: Sleep[]; nightsHome: number } {
  const away: Sleep[] = []
  let nightsHome = 0
  for (const v of data.visits) {
    if (v.lvl !== 0) continue
    const n = nightsIn(v)
    if (!n) continue
    if (isHome(data.places[v.place_id]) || distanceKm(homeOf(data, v.start), v) < 30) { nightsHome += n; continue }
    away.push({ v, nights: n })
  }
  return { away, nightsHome }
}

/** Where you slept: nights per city away from home, like a tour's dates list. */
export function tour(data: Data): Tour {
  const byCity = new Map<string, Stop>()
  const beds = new Map<string, Set<string>>()
  const { away, nightsHome } = sleptAway(data)
  let nightsAway = 0
  let headline: HeadlineAct | null = null
  for (const { v, nights: n } of away) {
    const p = data.places[v.place_id]
    nightsAway += n
    const city = p?.city ?? 'Unknown city'
    const s = byCity.get(city) ?? { city, country: p?.country_code ?? null, nights: 0, visits: 0, first: v.start, last: v.end, lat: v.lat, lng: v.lng, placeIds: [] }
    s.nights += n; s.visits++
    let b = beds.get(city)
    if (!b) beds.set(city, (b = new Set()))
    if (!b.has(v.place_id)) { b.add(v.place_id); s.placeIds.push(v.place_id) }
    s.first = Math.min(s.first, v.start); s.last = Math.max(s.last, v.end)
    byCity.set(city, s)
    const km = distanceKm(homeOf(data, v.start), v)
    if (!headline || km > headline.km) headline = { city, country: p?.country_code ?? null, km, nights: n, start: v.start, end: v.end, place_id: v.place_id }
  }
  const stops = [...byCity.values()].sort((a, b) => b.nights - a.nights || b.visits - a.visits)
  const [r0, r1] = data.meta.range
  return { stops, nightsAway, nightsHome, headline, years: [new Date(r0 * 1000).getUTCFullYear(), new Date(r1 * 1000).getUTCFullYear()] }
}
