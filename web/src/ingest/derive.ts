// Port of pipeline/geo.py + derive.py + export.py: parsed records → the Data the app reads.
import type { Data, Daily, Place, Trip } from '../data/types'
import type { Parsed, PVisit } from './parse'
import { homeAt, type Profile } from '../profile/profile'

const TRIP_RADIUS_KM = 50, STROKE_POINTS = 8000, ROLE_RADIUS_KM = 0.3

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = Math.PI / 180, p1 = lat1 * r, p2 = lat2 * r, dp = p2 - p1, dl = (lng2 - lng1) * r
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(a))
}

/** Nearest city in a 1° grid; the table is GeoNames cities ≥ 15k people. */
export interface Cities { lat: number[]; lng: number[]; name: string[]; cc: string[] }
export function geocoder(c: Cities) {
  const grid = new Map<number, number[]>()
  const key = (lat: number, lng: number) => (Math.floor(lat) + 90) * 400 + (Math.floor(lng) + 180)
  c.lat.forEach((la, i) => { const k = key(la, c.lng[i]); let b = grid.get(k); if (!b) grid.set(k, (b = [])); b.push(i) })
  return (lat: number, lng: number): { name: string; cc: string } => {
    let best = -1, bd = Infinity
    // The nearest city can sit in the neighbouring cell, so always look one ring past the first hit.
    for (let ring = 0; ring <= 3 && (best < 0 || ring < 2); ring++) {
      for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dy), Math.abs(dx)) !== ring) continue
        for (const i of grid.get(key(lat + dy, lng + dx)) ?? []) { const d = haversineKm(lat, lng, c.lat[i], c.lng[i]); if (d < bd) { bd = d; best = i } }
      }
    }
    return best < 0 ? { name: '', cc: '' } : { name: c.name[best], cc: c.cc[best] }
  }
}

const localDate = (ts: number, tz: number) => new Date((ts + tz * 60) * 1000).toISOString().slice(0, 10)
function* splitByLocalDay(start: number, end: number, tz: number): Generator<[string, number]> {
  let cur = start
  while (cur < end) {
    const local = new Date((cur + tz * 60) * 1000)
    const boundary = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1) / 1000 - tz * 60
    const chunk = Math.min(end, boundary)
    yield [local.toISOString().slice(0, 10), chunk - cur]
    cur = chunk
  }
}
const nights = (start: number, end: number, tz: number) => Math.round((Date.parse(localDate(end, tz)) - Date.parse(localDate(start, tz))) / 86400000)
const r3 = (x: number) => Math.round(x * 1000) / 1000

export type Role = 'home' | 'work' | null
/** Home = within 300 m of the home active on the visit date; work = within 300 m of the declared work place. */
export function roleOf(v: PVisit, profile: Profile): Role {
  const h = homeAt(profile.homes, v.start)
  if (haversineKm(h.lat, h.lng, v.lat, v.lng) <= ROLE_RADIUS_KM) return 'home'
  if (profile.work && haversineKm(profile.work.lat, profile.work.lng, v.lat, v.lng) <= ROLE_RADIUS_KM) return 'work'
  return null
}
const distHome = (profile: Profile, ts: number, lat: number, lng: number) => { const h = homeAt(profile.homes, ts); return haversineKm(h.lat, h.lng, lat, lng) }

export function derivePlaces(p: Parsed, profile: Profile): Record<string, Place> {
  const labels = new Map(p.frequent_places.map((f) => [f.place_id, f.label]))
  const out: Record<string, Place> = {}
  for (const v of p.visits) {
    const pl = out[v.place_id] ?? (out[v.place_id] = { lat: v.lat, lng: v.lng, label: labels.get(v.place_id) ?? null, role: null, city: v.city ?? null, country_code: v.cc ?? null, n_visits: 0, total_hours: 0, first_ts: v.start, last_ts: v.end, name: null, address: null })
    pl.n_visits++; pl.total_hours += (v.end - v.start) / 3600
    pl.first_ts = Math.min(pl.first_ts, v.start); pl.last_ts = Math.max(pl.last_ts, v.end)
    pl.role = pl.role ?? roleOf(v, profile)
  }
  return out
}

export function deriveDaily(p: Parsed, profile: Profile): Daily[] {
  type Row = Daily & { _places: Set<string>; _cities: Set<string> }
  const days = new Map<string, Row>()
  const day = (d: string) => { let r = days.get(d); if (!r) days.set(d, (r = { date: d, km_by_mode: {}, n_visits: 0, n_places: 0, n_new_places: 0, max_dist_from_home_km: 0, hours_home: 0, hours_work: 0, hours_other: 0, hours_transit: 0, cities: [], _places: new Set(), _cities: new Set() })); return r }
  const seen = new Set<string>()
  for (const v of p.visits) {
    const row = day(localDate(v.start, v.tz))
    row.n_visits++
    if (!seen.has(v.place_id)) { seen.add(v.place_id); row.n_new_places++ }
    const role = roleOf(v, profile)
    const bucket = role === 'home' ? 'hours_home' : role === 'work' ? 'hours_work' : 'hours_other'
    const dist = v.dist ?? distHome(profile, v.start, v.lat, v.lng)
    // Nested visits sit inside a parent stay whose hours are already counted.
    for (const [d, secs] of splitByLocalDay(v.start, v.end, v.tz)) {
      const r = day(d)
      if (v.lvl === 0) r[bucket] += secs / 3600
      r._places.add(v.place_id); if (v.city) r._cities.add(v.city)
      r.max_dist_from_home_km = Math.max(r.max_dist_from_home_km, dist)
    }
  }
  for (const a of p.activities) {
    const row = day(localDate(a.start, a.tz))
    row.km_by_mode[a.mode] = (row.km_by_mode[a.mode] ?? 0) + a.m / 1000
    for (const [d, secs] of splitByLocalDay(a.start, a.end, a.tz)) day(d).hours_transit += secs / 3600
    row.max_dist_from_home_km = Math.max(row.max_dist_from_home_km, distHome(profile, a.start, a.e_lat, a.e_lng))
    if (a.e_city) row._cities.add(a.e_city)
  }
  return [...days.keys()].sort().map((d) => {
    const { _places, _cities, ...r } = days.get(d)!
    for (const k in r.km_by_mode) r.km_by_mode[k] = r3(r.km_by_mode[k])
    r.n_places = _places.size; r.cities = [..._cities].sort()
    r.max_dist_from_home_km = Math.round(r.max_dist_from_home_km * 100) / 100
    r.hours_home = r3(r.hours_home); r.hours_work = r3(r.hours_work); r.hours_other = r3(r.hours_other); r.hours_transit = r3(r.hours_transit)
    return r
  })
}

export function deriveTrips(p: Parsed, profile: Profile): Trip[] {
  const flights = p.activities.filter((a) => a.mode === 'FLYING')
  type Cur = { start: number; end: number; tz: number; cities: string[]; max: number }
  const trips: Cur[] = []
  let cur: Cur | null = null
  const close = (c: Cur) => { if (nights(c.start, c.end, c.tz) >= 1) trips.push(c) }
  for (const v of p.visits) {
    const dist = v.dist ?? distHome(profile, v.start, v.lat, v.lng)
    const away = dist > TRIP_RADIUS_KM
    if (!cur && away) {
      let start = v.start
      for (const f of flights) if (v.start - f.end >= 0 && v.start - f.end <= 6 * 3600) start = Math.min(start, f.start)
      cur = { start, end: 0, tz: v.tz, cities: [], max: 0 }
    }
    if (cur) {
      if (away) { if (v.city && !cur.cities.includes(v.city)) cur.cities.push(v.city); cur.max = Math.max(cur.max, dist) }
      else { cur.end = v.start; close(cur); cur = null }
    }
  }
  if (cur && p.visits.length) { cur.end = p.visits[p.visits.length - 1].end; close(cur) }
  return trips.map((t) => {
    const km: Record<string, number> = {}
    for (const a of p.activities) if (a.start >= t.start && a.end <= t.end) km[a.mode] = r3((km[a.mode] ?? 0) + a.m / 1000)
    const m = p.memories.find((x) => x.start < t.end && x.end > t.start)
    return { start: t.start, end: t.end, nights: nights(t.start, t.end, t.tz), max_dist_from_home_km: Math.round(t.max * 100) / 100, total_km_by_mode: km, anchor_cities: t.cities, memory: m ? { distance_from_origin_km: m.km, destination_place_ids: m.dests } : null }
  })
}

/** Tag city/country/distance in place, then assemble every file the Python export writes. */
export function buildData(p: Parsed, cities: Cities, source: { file: string; sha256: string }, profile: Profile): Data {
  const geo = geocoder(cities)
  for (const v of p.visits) { const h = geo(v.lat, v.lng); v.city = h.name || null; v.cc = h.cc || null; v.dist = distHome(profile, v.start, v.lat, v.lng) }
  for (const a of p.activities) a.e_city = geo(a.e_lat, a.e_lng).name || null

  const total = p.paths.reduce((n, x) => n + x.pts.length, 0)
  const k = Math.max(1, Math.ceil(total / STROKE_POINTS))
  const strokes = p.paths.filter((x) => x.pts.length > 1).map((x) => ({ start: x.start, end: x.end, pts: x.pts.filter((_, i) => i % k === 0 || i === x.pts.length - 1).map(([t, la, ln]) => [t, Math.round(la * 1e4) / 1e4, Math.round(ln * 1e4) / 1e4] as [number, number, number]) }))

  const last = profile.homes[profile.homes.length - 1]
  const starts = [...p.visits.map((v) => v.start), ...p.activities.map((a) => a.start)]
  const ends = [...p.visits.map((v) => v.end), ...p.activities.map((a) => a.end)]
  return {
    visits: p.visits.map(({ city: _c, cc: _cc, dist: _d, ...v }) => ({ ...v, p: r3(v.p) })),
    activities: p.activities.map(({ e_city: _e, ...a }) => ({ ...a, p: r3(a.p) })),
    paths: p.paths, strokes,
    places: derivePlaces(p, profile), daily: deriveDaily(p, profile), trips: deriveTrips(p, profile),
    profile: { home: { lat: last.lat, lng: last.lng }, homes: profile.homes, work: profile.work, frequent_places: p.frequent_places, frequent_trips: p.frequent_trips, persona: p.persona },
    meta: { source_file: source.file, source_sha256: source.sha256, built_at: Math.floor(Date.now() / 1000), range: [starts.length ? Math.min(...starts) : 0, ends.length ? Math.max(...ends) : 0], import_report: p.report },
  }
}

