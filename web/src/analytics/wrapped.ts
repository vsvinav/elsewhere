import type { Data, Visit } from '../data/types'
import { inRange, kmByMode } from './range'
import { boundsOf, isHome, isWork, type Bounds } from './geo'
import { fmtKm, MODE_LABEL } from './format'
import { distanceKm } from './position'

export interface Arc { s: [number, number]; e: [number, number] }
export interface Card {
  headline: string
  detail: string
  focus: Bounds | null
  points?: [number, number][]
  arcs?: Arc[]
}

const EARTH_KM = 40075
const MARATHON_KM = 42.195

function pts(visits: Visit[]): [number, number][] { return visits.map((v) => [v.lng, v.lat]) }

/** Ordered story cards for the given range. Each card says where the map should look. */
export function wrappedFacts(data: Data, range: [number, number]): Card[] {
  const visits = inRange(data.visits, range).filter((v) => v.lvl === 0)
  const acts = inRange(data.activities, range)
  const km = kmByMode(acts)
  const total = Object.values(km).reduce((a, b) => a + b, 0)
  const cards: Card[] = []
  if (!visits.length && !acts.length) return cards

  const days = Math.max(1, Math.round((range[1] - range[0]) / 86400))
  const cities = new Set<string>(), countries = new Set<string>(), placeIds = new Set<string>()
  for (const v of visits) {
    placeIds.add(v.place_id)
    const p = data.places[v.place_id]
    if (p?.city) cities.add(p.city)
    if (p?.country_code) countries.add(p.country_code)
  }
  cards.push({
    headline: `${days} days on the move`,
    detail: `${placeIds.size} places · ${cities.size} cities · ${countries.size} ${countries.size === 1 ? 'country' : 'countries'}`,
    focus: boundsOf(visits), points: pts(visits),
  })

  const topMode = Object.entries(km).sort((a, b) => b[1] - a[1])[0]
  const laps = total / EARTH_KM
  cards.push({
    headline: `${fmtKm(total)} travelled`,
    detail: laps >= 0.5
      ? `${laps.toFixed(1)}× around the Earth. Mostly by ${MODE_LABEL[topMode[0]]?.toLowerCase() ?? topMode[0]}.`
      : `${Math.round(laps * 100)}% of the way around the Earth. Mostly by ${MODE_LABEL[topMode[0]]?.toLowerCase() ?? topMode[0]}.`,
    focus: boundsOf(visits), points: pts(visits),
  })

  const walk = (km.WALKING ?? 0) + (km.RUNNING ?? 0)
  if (walk > 1) {
    const marathons = walk / MARATHON_KM
    cards.push({
      headline: `${fmtKm(walk)} on foot`,
      detail: marathons >= 1 ? `That's ${marathons.toFixed(1)} marathons, about ${Math.round(walk * 1300).toLocaleString()} steps.` : `About ${Math.round(walk * 1300).toLocaleString()} steps.`,
      focus: null,
    })
  }

  const flights = acts.filter((a) => a.mode === 'FLYING')
  if (flights.length) {
    const home = data.profile.home
    let farthest = flights[0], fd = 0
    for (const f of flights) {
      const d = distanceKm(home, { lng: f.e_lng, lat: f.e_lat })
      if (d > fd) { fd = d; farthest = f }
    }
    const landing = visits.find((v) => v.start >= farthest.end - 3 * 3600 && v.start <= farthest.end + 6 * 3600)
    const where = landing ? data.places[landing.place_id]?.city : null
    cards.push({
      headline: `${flights.length} ${flights.length === 1 ? 'flight' : 'flights'}, ${fmtKm(km.FLYING ?? 0)} in the air`,
      detail: where ? `Farthest from home: ${where}, ${fmtKm(fd)} away.` : `Farthest from home: ${fmtKm(fd)}.`,
      focus: boundsOf(flights.flatMap((f) => [{ lng: f.s_lng, lat: f.s_lat }, { lng: f.e_lng, lat: f.e_lat }])),
      arcs: flights.map((f) => ({ s: [f.s_lng, f.s_lat], e: [f.e_lng, f.e_lat] })),
    })
  }

  const counts = new Map<string, { n: number; h: number }>()
  for (const v of visits) {
    if (isHome(v.type) || isWork(v.type)) continue
    const c = counts.get(v.place_id) ?? { n: 0, h: 0 }
    c.n++; c.h += (v.end - v.start) / 3600
    counts.set(v.place_id, c)
  }
  const fav = [...counts.entries()].sort((a, b) => b[1].n - a[1].n)[0]
  if (fav && fav[1].n >= 2) {
    const p = data.places[fav[0]]
    cards.push({
      headline: p?.name ?? p?.city ?? 'Your spot',
      detail: `Your favorite place: ${fav[1].n} visits, ${Math.round(fav[1].h)} hours${p?.city && p.name ? ` · ${p.city}` : ''}.`,
      focus: p ? [[p.lng - 0.004, p.lat - 0.003], [p.lng + 0.004, p.lat + 0.003]] : null,
      points: p ? [[p.lng, p.lat]] : [],
    })
  }

  const trips = inRange(data.trips, range).sort((a, b) => b.nights - a.nights)
  if (trips[0] && trips[0].nights >= 1) {
    const t = trips[0]
    const tv = data.visits.filter((v) => v.lvl === 0 && v.start >= t.start && v.end <= t.end)
    const tkm = Object.values(t.total_km_by_mode).reduce((a, b) => a + b, 0)
    cards.push({
      headline: `${t.nights} nights away`,
      detail: `Longest trip: ${t.anchor_cities.slice(0, 3).join(', ') || 'far from home'}, up to ${fmtKm(t.max_dist_from_home_km)} from home, ${fmtKm(tkm)} total.`,
      focus: boundsOf(tv), points: pts(tv),
    })
  }

  const iso = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10)
  const days_ = data.daily.filter((d) => d.date >= iso(range[0]) && d.date <= iso(range[1]))
  const busiest = [...days_].sort((a, b) => b.n_places - a.n_places)[0]
  if (busiest && busiest.n_places >= 3) {
    const dayStart = Date.parse(busiest.date) / 1000
    const dv = data.visits.filter((v) => v.lvl === 0 && v.start >= dayStart - 12 * 3600 && v.start <= dayStart + 36 * 3600)
    const dkm = Object.values(busiest.km_by_mode).reduce((a, b) => a + b, 0)
    cards.push({
      headline: `${busiest.n_places} places in one day`,
      detail: `${new Date(dayStart * 1000).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' })}${busiest.cities[0] ? ` in ${busiest.cities[0]}` : ''}, ${fmtKm(dkm)} covered.`,
      focus: boundsOf(dv), points: pts(dv),
    })
  }

  const firstTimers = [...placeIds].filter((id) => { const p = data.places[id]; return p && p.first_ts >= range[0] && p.first_ts <= range[1] })
  const newCities = new Set(firstTimers.map((id) => data.places[id].city).filter(Boolean))
  if (firstTimers.length) {
    const fp = firstTimers.map((id) => data.places[id])
    cards.push({
      headline: `${firstTimers.length} places for the first time`,
      detail: newCities.size ? `Including ${newCities.size} new ${newCities.size === 1 ? 'city' : 'cities'}: ${[...newCities].slice(0, 4).join(', ')}.` : 'All within familiar cities.',
      focus: boundsOf(fp), points: fp.map((p) => [p.lng, p.lat]),
    })
  }
  return cards
}
