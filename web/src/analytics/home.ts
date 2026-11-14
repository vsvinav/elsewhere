import type { Data, Place, Trip } from '../data/types'
import { isHome, isWork } from './geo'
import { distanceKm } from './position'

export interface Named { id: string; place: Place; name: string }
export interface YearRow { year: number; km: number; places: number; trips: number; flights: number }
export interface HomeFacts {
  days: number
  range: [number, number]
  totalKm: number
  kmByMode: [string, number][]
  places: number
  cities: number
  countries: number
  topCities: string[]
  thirdPlaces: Named[]
  hours: { home: number; work: number; other: number; transit: number }
  flights: number
  trips: number
  longestTrip: (Trip & { city: string | null }) | null
  records: {
    longestDay: { date: string; km: number } | null
    busiestDay: { date: string; places: number } | null
    farthest: { km: number; city: string | null } | null
  }
  years: YearRow[]
}

export function placeName(p: Place | undefined, id: string): string {
  return p?.name ?? p?.label ?? p?.city ?? id.slice(0, 8)
}

function yearOf(ts: number): number { return new Date(ts * 1000).getUTCFullYear() }

export function homeFacts(data: Data): HomeFacts {
  const visits = data.visits.filter((v) => v.lvl === 0)
  const km: Record<string, number> = {}
  for (const a of data.activities) km[a.mode] = (km[a.mode] ?? 0) + a.m / 1000
  const kmByMode = Object.entries(km).sort((a, b) => b[1] - a[1])
  const totalKm = kmByMode.reduce((s, [, v]) => s + v, 0)

  // Places, cities and countries count the whole place book, the same rule the Stops tab prints.
  const cityVisits = new Map<string, number>()
  const countries = new Set<string>()
  for (const p of Object.values(data.places)) {
    if (p.city) cityVisits.set(p.city, (cityVisits.get(p.city) ?? 0) + p.n_visits)
    if (p.country_code) countries.add(p.country_code)
  }
  const topCities = [...cityVisits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c)

  const thirdPlaces = Object.entries(data.places)
    .filter(([, p]) => !isHome(p.semantic_type) && !isWork(p.semantic_type) && p.label == null)
    .sort((a, b) => b[1].n_visits - a[1].n_visits)
    .slice(0, 3)
    .map(([id, place]) => ({ id, place, name: placeName(place, id) }))

  const hours = { home: 0, work: 0, other: 0, transit: 0 }
  let longestDay: HomeFacts['records']['longestDay'] = null
  let busiestDay: HomeFacts['records']['busiestDay'] = null
  for (const d of data.daily) {
    hours.home += d.hours_home; hours.work += d.hours_work; hours.other += d.hours_other; hours.transit += d.hours_transit
    const dayKm = Object.values(d.km_by_mode).reduce((a, b) => a + b, 0)
    if (!longestDay || dayKm > longestDay.km) longestDay = { date: d.date, km: dayKm }
    if (!busiestDay || d.n_places > busiestDay.places) busiestDay = { date: d.date, places: d.n_places }
  }

  const home = data.profile.home
  let farthest: HomeFacts['records']['farthest'] = null
  for (const v of visits) {
    const d = distanceKm(home, v)
    if (!farthest || d > farthest.km) farthest = { km: d, city: data.places[v.place_id]?.city ?? null }
  }

  const flights = data.activities.filter((a) => a.mode === 'FLYING')
  const lt = [...data.trips].sort((a, b) => b.nights - a.nights)[0] ?? null
  const longestTrip = lt ? { ...lt, city: lt.anchor_cities[0] ?? null } : null

  const years = new Map<number, YearRow & { placeIds: Set<string> }>()
  const row = (y: number) => {
    let r = years.get(y)
    if (!r) { r = { year: y, km: 0, places: 0, trips: 0, flights: 0, placeIds: new Set() }; years.set(y, r) }
    return r
  }
  for (const a of data.activities) row(yearOf(a.start)).km += a.m / 1000
  for (const v of visits) row(yearOf(v.start)).placeIds.add(v.place_id)
  for (const t of data.trips) row(yearOf(t.start)).trips++
  for (const f of flights) row(yearOf(f.start)).flights++

  const [r0, r1] = data.meta.range
  return {
    days: Math.round((r1 - r0) / 86400),
    range: [r0, r1],
    totalKm, kmByMode,
    places: Object.keys(data.places).length,
    cities: cityVisits.size,
    countries: countries.size,
    topCities, thirdPlaces, hours,
    flights: flights.length,
    trips: data.trips.length,
    longestTrip,
    records: { longestDay, busiestDay, farthest },
    years: [...years.values()].sort((a, b) => a.year - b.year)
      .map(({ placeIds, ...r }) => ({ ...r, places: placeIds.size })),
  }
}
