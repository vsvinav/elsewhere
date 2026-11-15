import type { Activity, Daily, Data, Trip, Visit } from '../data/types'
import { bedStrip, type Night } from './beds'
import { isHome } from './geo'
import { lensOf } from './lens'
import { distanceKm, type LngLat } from './position'
import { dayType } from './stats'
import { homeAt } from '../profile/profile'

/*
 * "On this day": which past day the record should talk about today, and the questions it can
 * answer about it. Everything here is pure and reads a per-record index built once (O(n) in
 * visits + days, cached by identity), so a highlight and all of its answers cost O(years · k)
 * where k is the handful of visits on a day.
 */

const DAY = 86400
const NIGHT_HOUR = 3
const HOME_RADIUS_KM = 30
/** A follow-up chain is cut after this many answers. */
export const MAX_DEPTH = 4

export type Verb = 'woke up in' | 'landed in' | 'arrived in' | 'were in'
/** Anything the map can open exactly: the day range and the places the answer was computed from. */
export interface Door { range: [number, number]; placeIds: string[]; playhead?: number }
export type FactId = 'trip' | 'km' | 'first' | 'new' | 'transit' | 'week'
export interface HFact extends Door { id: FactId; label: string; strip?: Night[] }
export interface Highlight extends Door {
  /** Local date the highlight is about. */
  date: string
  yearsAgo: number
  /** 'week' when the pick came from the ±3-day widening. */
  scope: 'day' | 'week'
  verb: Verb
  city: string
  /** false when the city is unknown and `city` prints coordinates. */
  cityKnown: boolean
  score: number
  facts: HFact[]
  playhead: number
  firstVisit: Visit
  trip: Trip | null
  daily: Daily | null
  tz: number
}

export type FollowUpId = 'stay' | 'distance' | 'trip' | 'route' | 'compare' | 'did' | 'back' | 'farthest' | 'lastYear'
interface Base extends Door { title: string; detail: string }
export interface StayAnswer extends Base { kind: 'stay'; nights: number; from: string; to: string; strip: Night[] }
export interface LegInfo { mode: string; from: string; to: string; hours: number; range: [number, number] }
export interface DistanceAnswer extends Base { kind: 'distance'; km: number; leg: LegInfo | null }
export interface SetlistCity extends Door { city: string; nights: number; first: boolean }
export interface TripAnswer extends Base { kind: 'trip'; trip: Trip; cities: SetlistCity[] }
export interface RouteAnswer extends Base { kind: 'route'; legs: number; km: number; kmByMode: Record<string, number> }
/** `km` is null when no home is set, so there is nothing to measure from. */
export interface YearCol { year: number; city: string | null; km: number | null; now: boolean }
export interface CompareAnswer extends Base { kind: 'compare'; years: YearCol[] }
export interface Stop extends Door { place_id: string; name: string; type: string | null; hours: number; start: number }
export interface DidAnswer extends Base { kind: 'did'; stops: Stop[] }
export interface BackAnswer extends Base { kind: 'back'; times: number; last: string | null }
export interface FarthestAnswer extends Base { kind: 'farthest'; is: boolean; date: string; km: number; city: string | null }
export interface HighlightAnswer extends Base { kind: 'highlight'; highlight: Highlight }
export type Answer = StayAnswer | DistanceAnswer | TripAnswer | RouteAnswer | CompareAnswer | DidAnswer | BackAnswer | FarthestAnswer | HighlightAnswer
export interface FollowUp { id: FollowUpId; question: string; answer: Answer }

export type HighlightState =
  | { kind: 'highlight'; highlight: Highlight }
  | { kind: 'quiet'; date: string; nearest: Highlight | null }
  | { kind: 'short'; starts: string; highlight: Highlight }
  | { kind: 'none' }

// ---------- dates ----------

/** Local calendar date of an instant, given the visit's UTC offset in minutes. */
export const localDay = (ts: number, tz: number) => new Date((ts + tz * 60) * 1000).toISOString().slice(0, 10)
const midnightUTC = (date: string) => Date.parse(date + 'T00:00:00Z') / 1000
const dayStartIn = (date: string, tz: number) => midnightUTC(date) - tz * 60
/** Days since the epoch, in local time: integer arithmetic for the hot loops. */
const dayNum = (ts: number, tz: number) => Math.floor((ts + tz * 60) / DAY)
const numOf = (date: string) => midnightUTC(date) / DAY
const dateOf = (n: number) => new Date(n * DAY * 1000).toISOString().slice(0, 10)
const shiftDay = (date: string, n: number) => dateOf(numOf(date) + n)
const yearOf = (date: string) => Number(date.slice(0, 4))
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
/** The same month/day in year y; 29 Feb falls back to 28 Feb. */
export function sameDayIn(date: string, y: number): string {
  const md = date.slice(5)
  return `${y}-${md === '02-29' && !isLeap(y) ? '02-28' : md}`
}
/** Today's date as the browser sees it, as YYYY-MM-DD. */
export const localToday = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dmy = (date: string) => { const [y, m, d] = date.split('-').map(Number); return `${d} ${MON[m - 1]} ${y}` }
/** "12–17 Nov 2023", "28 Feb – 2 Mar 2023", "30 Dec 2022 – 2 Jan 2023". */
export function fmtSpan(from: string, to: string): string {
  if (from === to) return dmy(from)
  const [fy, fm, fd] = from.split('-').map(Number), [ty, tm, td] = to.split('-').map(Number)
  if (fy === ty && fm === tm) return `${fd}–${td} ${MON[fm - 1]} ${fy}`
  if (fy === ty) return `${fd} ${MON[fm - 1]} – ${td} ${MON[tm - 1]} ${ty}`
  return `${dmy(from)} – ${dmy(to)}`
}
const n0 = (x: number) => Math.round(x).toLocaleString('en-US')

// ---------- index ----------

interface Index {
  /** Top-level visits covering each local day, in start order. */
  byDay: Map<string, Visit[]>
  daily: Map<string, Daily>
  /** Where you slept, keyed by the day number of the 03:00 instant. */
  nights: Map<number, Night>
  /** The place that claimed each night, same first-come rule as bedStrip. */
  nightPid: Map<number, string>
  /** Local date of the first top-level visit to each city. */
  firstInCity: Map<string, string>
  /** Top-level visits per city in start order. */
  byCity: Map<string, Visit[]>
  /** Sorted distinct local day numbers covered by a visit in each city. */
  cityDays: Map<string, number[]>
  centroid: Map<string, LngLat>
  farthest: Daily | null
  hasHome: boolean
  homeOf: (ts: number) => LngLat
  atHome: (v: Visit) => boolean
  /** Score of each daily row, computed lazily and memoised. */
  scores: Map<string, number>
}

const INDEX = new WeakMap<Data, Index>()

/** The per-record index. Built once per `data` identity, O(visits + days covered). */
export function indexOf(data: Data): Index {
  const hit = INDEX.get(data)
  if (hit) return hit
  const homes = data.profile.homes
  const hasHome = homes ? homes.length > 0 : !!data.profile.home
  const homeOf = (ts: number) => (homes?.length ? homeAt(homes, ts) : data.profile.home)
  const atHome = (v: Visit) => isHome(data.places[v.place_id]) || (hasHome && distanceKm(homeOf(v.start), v) < HOME_RADIUS_KM)
  const byDay = new Map<string, Visit[]>(), byCity = new Map<string, Visit[]>(), firstInCity = new Map<string, string>()
  const cityDays = new Map<string, number[]>(), nightPid = new Map<number, string>()
  const sums = new Map<string, { lat: number; lng: number; n: number }>()
  for (const v of data.visits) {
    if (v.lvl !== 0) continue
    const a = dayNum(v.start, v.tz), b = dayNum(v.end, v.tz)
    for (let d = a; d <= b; d++) { const k = dateOf(d); const l = byDay.get(k); if (l) l.push(v); else byDay.set(k, [v]) }
    // The 03:00 instants inside the stay, each claimed by the first visit that covers it.
    for (let d = Math.ceil((v.start + v.tz * 60 - NIGHT_HOUR * 3600) / DAY); d * DAY - v.tz * 60 + NIGHT_HOUR * 3600 <= v.end; d++) if (!nightPid.has(d)) nightPid.set(d, v.place_id)
    const city = data.places[v.place_id]?.city
    if (!city) continue
    const l = byCity.get(city); if (l) l.push(v); else byCity.set(city, [v])
    // Visits come in start order, so a day at or before the last pushed one is already covered.
    let cd = cityDays.get(city); if (!cd) { cd = []; cityDays.set(city, cd) }
    for (let d = Math.max(a, (cd[cd.length - 1] ?? -Infinity) + 1); d <= b; d++) cd.push(d)
    if (!atHome(v) && !firstInCity.has(city)) firstInCity.set(city, dateOf(a))
    const s = sums.get(city); if (s) { s.lat += v.lat; s.lng += v.lng; s.n++ } else sums.set(city, { lat: v.lat, lng: v.lng, n: 1 })
  }
  const centroid = new Map<string, LngLat>()
  for (const [c, s] of sums) centroid.set(c, { lat: s.lat / s.n, lng: s.lng / s.n })
  const daily = new Map<string, Daily>()
  let farthest: Daily | null = null
  for (const d of data.daily) { daily.set(d.date, d); if (!farthest || d.max_dist_from_home_km > farthest.max_dist_from_home_km) farthest = d }
  const nights = new Map<number, Night>()
  if (data.visits.length) for (const n of bedStrip(data)) if (n.kind !== 'none') nights.set(numOf(n.date), n)
  const ix: Index = { byDay, daily, nights, nightPid, firstInCity, byCity, cityDays, centroid, farthest, hasHome, homeOf, atHome, scores: new Map() }
  INDEX.set(data, ix)
  return ix
}

/** Index of the last item with start <= t, or -1. Items sorted by start. */
function lastStarted(items: { start: number }[], t: number): number {
  let lo = 0, hi = items.length - 1, out = -1
  while (lo <= hi) { const m = (lo + hi) >> 1; if (items[m].start <= t) { out = m; lo = m + 1 } else hi = m - 1 }
  return out
}

// ---------- one day ----------

/** The visit the day is about: the earliest one, skipping a home stay when the day went anywhere else. */
function leadVisit(ix: Index, visits: Visit[]): Visit {
  return visits.find((v) => !ix.atHome(v)) ?? visits[0]
}

function cityOf(data: Data, v: Visit): { city: string; known: boolean } {
  const c = data.places[v.place_id]?.city
  return c ? { city: c, known: true } : { city: `${v.lat.toFixed(2)}°, ${v.lng.toFixed(2)}°`, known: false }
}

const tripOn = (data: Data, start: number, end: number): Trip | null => data.trips.find((t) => t.start <= end && t.end >= start) ?? null

function scoreDay(data: Data, ix: Index, date: string): number {
  const hit = ix.scores.get(date)
  if (hit !== undefined) return hit
  const visits = ix.byDay.get(date)
  let s = 0
  if (visits?.length) {
    const lead = leadVisit(ix, visits)
    const d = ix.daily.get(date)
    const start = dayStartIn(date, lead.tz), end = start + DAY
    if (d) {
      if (d.max_dist_from_home_km > 100) s += 50
      s += 10 * d.n_new_places
      s += Math.min(20, Math.round(d.max_dist_from_home_km / 500))
      const t = dayType(d)
      if (t === 'home' || t === 'work') s -= 40
    }
    if (tripOn(data, start, end)) s += 30
    const city = data.places[lead.place_id]?.city
    if (city && ix.firstInCity.get(city) === date) s += 15
  }
  ix.scores.set(date, s)
  return s
}

function verbFor(data: Data, ix: Index, date: string, lead: Visit, start: number, end: number): Verb {
  if (lead.start <= start + NIGHT_HOUR * 3600 && lead.end >= start + NIGHT_HOUR * 3600) return 'woke up in'
  const acts = data.activities
  let i = lastStarted(acts, start)
  if (i < 0 || acts[i].end < start) i++
  // The day's first leg is a flight that got you to the first stop: it ended before the stop, or at it.
  if (i < acts.length && acts[i].start < end && lensOf(acts[i].mode) === 'fly' && (acts[i].end <= lead.start || distanceKm({ lat: acts[i].e_lat, lng: acts[i].e_lng }, lead) < 150)) return 'landed in'
  const city = data.places[lead.place_id]?.city ?? null
  if ((ix.nights.get(numOf(date))?.city ?? null) !== city) return 'arrived in'
  return 'were in'
}

function weekStrip(ix: Index, date: string): Night[] {
  const out: Night[] = []
  const c = numOf(date)
  for (let k = -3; k <= 3; k++) out.push(ix.nights.get(c + k) ?? { date: dateOf(c + k), kind: 'none', city: null })
  return out
}

function factsFor(data: Data, ix: Index, date: string, lead: Visit, city: string, known: boolean, d: Daily | null, trip: Trip | null, door: Door): HFact[] {
  const out: HFact[] = []
  if (trip) {
    const into = Math.round((midnightUTC(date) - midnightUTC(localDay(trip.start, lead.tz))) / DAY)
    out.push({ id: 'trip', label: `${into === 0 ? 'Day one of' : `${into} night${into === 1 ? '' : 's'} into`} a ${trip.nights}-night trip`, range: [trip.start, trip.end], placeIds: trip.memory?.destination_place_ids ?? door.placeIds })
  }
  if (ix.hasHome && d && d.max_dist_from_home_km >= 1) out.push({ id: 'km', label: `${n0(d.max_dist_from_home_km)} km from home`, ...door })
  if (known && ix.firstInCity.get(city) === date) out.push({ id: 'first', label: `First time in ${city}`, ...door })
  if (d && d.n_new_places > 0) out.push({ id: 'new', label: `${d.n_new_places} new place${d.n_new_places === 1 ? '' : 's'} that day`, ...door })
  if (d && d.hours_transit >= 0.5) out.push({ id: 'transit', label: `${d.hours_transit < 10 ? d.hours_transit.toFixed(1) : Math.round(d.hours_transit)} h on the move`, ...door })
  if (out.length < 3 && ix.nights.size) out.push({ id: 'week', label: 'Weather of your week', strip: weekStrip(ix, date), range: [door.range[0] - 3 * DAY, door.range[1] + 3 * DAY], placeIds: door.placeIds })
  return out.slice(0, 3)
}

/** The highlight for one specific record day, whatever it scores. Returns null only when nothing was recorded that day. */
export function highlightOn(data: Data, date: string, yearsAgo: number, scope: 'day' | 'week' = 'day'): Highlight {
  const ix = indexOf(data)
  const visits = ix.byDay.get(date)
  if (!visits?.length) throw new Error(`no visits on ${date}`)
  const lead = leadVisit(ix, visits)
  const start = dayStartIn(date, lead.tz), end = start + DAY
  const { city, known } = cityOf(data, lead)
  const d = ix.daily.get(date) ?? null
  const trip = tripOn(data, start, end)
  const placeIds = [...new Set(visits.map((v) => v.place_id))]
  const door: Door = { range: [start, end], placeIds, playhead: lead.start }
  return {
    date, yearsAgo, scope, verb: verbFor(data, ix, date, lead, start, end), city, cityKnown: known,
    score: scoreDay(data, ix, date), facts: factsFor(data, ix, date, lead, city, known, d, trip, door),
    range: [start, end], placeIds, playhead: lead.start, firstVisit: lead, trip, daily: d, tz: lead.tz,
  }
}

const hasVisits = (ix: Index, date: string) => (ix.byDay.get(date)?.length ?? 0) > 0

/** Years strictly before `date`'s year that the record touches. */
function pastYears(data: Data, date: string): number[] {
  const y0 = new Date(data.meta.range[0] * 1000).getUTCFullYear(), y1 = Math.min(new Date(data.meta.range[1] * 1000).getUTCFullYear(), yearOf(date) - 1)
  const out: number[] = []
  for (let y = y0; y <= y1; y++) out.push(y)
  return out
}

/**
 * The past day the record should talk about on `date` (YYYY-MM-DD, local). Same month/day in each
 * past year, scored; ties go to the oldest year; nothing positive widens to ±3 days ("this week").
 * Null on a quiet day. O(years · visits-per-day) after the index.
 */
export function highlightFor(data: Data, date: string): Highlight | null {
  const ix = indexOf(data)
  const years = pastYears(data, date)
  const pick = (offsets: number[], scope: 'day' | 'week'): Highlight | null => {
    let best: { date: string; y: number; off: number; score: number } | null = null
    for (const y of years) for (const off of offsets) {
      const d = shiftDay(sameDayIn(date, y), off)
      if (!hasVisits(ix, d)) continue
      const score = scoreDay(data, ix, d)
      if (score <= 0) continue
      if (!best || score > best.score || (score === best.score && (y < best.y || (y === best.y && Math.abs(off) < Math.abs(best.off))))) best = { date: d, y, off, score }
    }
    return best ? highlightOn(data, best.date, yearOf(date) - yearOf(best.date), scope) : null
  }
  return pick([0], 'day') ?? pick([-3, -2, -1, 1, 2, 3], 'week')
}

/** Calendar distance between two month/days, ignoring the year (0..183). */
function calendarGap(a: string, b: string): number {
  const d = Math.abs((midnightUTC(sameDayIn(a, 2001)) - midnightUTC(sameDayIn(b, 2001))) / DAY)
  return Math.min(d, 365 - d)
}

/** The highlight plus its empty states: quiet day (with the nearest card) and a record younger than a year. */
export function highlightState(data: Data, date: string): HighlightState {
  const ix = indexOf(data)
  if (!data.daily.length || !data.visits.length) return { kind: 'none' }
  const [r0, r1] = data.meta.range
  const positive = data.daily.filter((d) => hasVisits(ix, d.date) && scoreDay(data, ix, d.date) > 0)
  if (r1 - r0 < 365 * DAY && pastYears(data, date).every((y) => midnightUTC(sameDayIn(date, y)) + 3 * DAY < r0)) {
    const top = positive.sort((a, b) => scoreDay(data, ix, b.date) - scoreDay(data, ix, a.date) || a.date.localeCompare(b.date))[0]
    if (!top) return { kind: 'none' }
    // The record starts on the first visit's own local day, not the UTC day of the range.
    const first = data.visits[lastStarted(data.visits, r0 - 1) + 1]
    return { kind: 'short', starts: first ? localDay(first.start, first.tz) : localDay(r0, 0), highlight: highlightOn(data, top.date, yearOf(date) - yearOf(top.date)) }
  }
  const h = highlightFor(data, date)
  if (h) return { kind: 'highlight', highlight: h }
  let near: Daily | null = null, gap = Infinity
  for (const d of positive) { const g = calendarGap(d.date, date); if (g < gap) { gap = g; near = d } }
  return { kind: 'quiet', date, nearest: near ? highlightOn(data, near.date, yearOf(date) - yearOf(near.date)) : null }
}

// ---------- follow-ups ----------

/** Contiguous run of nights in the highlight's city around its day, via the nights index. O(run). */
export function stayLength(data: Data, h: Highlight): StayAnswer | null {
  const ix = indexOf(data)
  if (!h.cityKnown) return null
  const d0 = numOf(h.date)
  const seed = [d0, d0 + 1].find((d) => ix.nights.get(d)?.city === h.city)
  if (seed === undefined) return null
  let from = seed, to = seed
  while (ix.nights.get(from - 1)?.city === h.city) from--
  while (ix.nights.get(to + 1)?.city === h.city) to++
  const strip: Night[] = [], ids = new Set<string>()
  for (let d = from; d <= to; d++) { strip.push(ix.nights.get(d)!); const pid = ix.nightPid.get(d); if (pid) ids.add(pid) }
  const n = strip.length, fromDate = dateOf(from), toDate = dateOf(to)
  return { kind: 'stay', nights: n, from: fromDate, to: toDate, strip, title: `${n} night${n === 1 ? '' : 's'}`, detail: fmtSpan(fromDate, toDate), range: [(from - 1) * DAY - h.tz * 60, (to + 1) * DAY - h.tz * 60], placeIds: [...ids] }
}

/** Name for a point: the home city when it is home, else the closest city you have visited within 100 km, else coordinates. O(cities). */
function cityNear(data: Data, ix: Index, p: LngLat, ts: number): string {
  if (ix.hasHome && distanceKm(ix.homeOf(ts), p) < HOME_RADIUS_KM) return data.profile.homes?.length ? homeAt(data.profile.homes, ts).city : 'home'
  let best: string | null = null, bestKm = 100
  for (const [city, c] of ix.centroid) { const km = distanceKm(c, p); if (km < bestKm) { bestKm = km; best = city } }
  return best ?? `${p.lat.toFixed(2)}°, ${p.lng.toFixed(2)}°`
}

const MODE_VERB: Record<string, string> = { fly: 'flew', transit: 'rode', drive: 'drove', foot: 'walked', all: 'went' }

/** Distance from home to the city's centroid, and the flight or train that ended there. O(log n + legs back to the trip start). */
export function distanceFromHome(data: Data, h: Highlight): DistanceAnswer | null {
  const ix = indexOf(data)
  if (!ix.hasHome || !h.cityKnown) return null
  const c = ix.centroid.get(h.city)
  if (!c) return null
  const km = distanceKm(ix.homeOf(h.firstVisit.start), c)
  const acts = data.activities
  const floor = h.trip?.start ?? h.range[0] - 14 * DAY
  let leg: LegInfo | null = null
  for (let i = lastStarted(acts, h.range[1]); i >= 0 && acts[i].start >= floor; i--) {
    const a = acts[i], lens = lensOf(a.mode)
    if ((lens === 'fly' || a.mode === 'IN_TRAIN') && distanceKm({ lat: a.e_lat, lng: a.e_lng }, c) < 150) {
      leg = { mode: a.mode, from: cityNear(data, ix, { lat: a.s_lat, lng: a.s_lng }, a.start), to: h.city, hours: Math.round((a.end - a.start) / 3600), range: [a.start, a.end] }
      break
    }
  }
  const hrs = leg ? (leg.hours >= 1 ? `, ${leg.hours} h` : '') : ''
  return { kind: 'distance', km, leg, title: `${n0(km)} km`, detail: leg ? `${MODE_VERB[lensOf(leg.mode)]} ${leg.from} → ${leg.to}${hrs}` : 'from home', range: leg ? [leg.range[0], h.range[1]] : h.range, placeIds: h.placeIds }
}

/** Where the whole trip went: cities in order with nights slept, firsts flagged. O(trip days). */
export function tripSetlist(data: Data, h: Highlight): TripAnswer | null {
  const ix = indexOf(data)
  const t = h.trip
  if (!t) return null
  const cities = new Map<string, SetlistCity>()
  const a = dayNum(t.start, h.tz), b = dayNum(t.end, h.tz), aDate = dateOf(a)
  for (let d = a + 1; d <= b; d++) {
    const n = ix.nights.get(d)
    if (!n || n.kind === 'home' || !n.city) continue
    const pid = ix.nightPid.get(d)
    const s = cities.get(n.city)
    const nightStart = (d - 1) * DAY - h.tz * 60, nightEnd = (d + 1) * DAY - h.tz * 60
    if (s) { s.nights++; s.range[1] = nightEnd; if (pid && !s.placeIds.includes(pid)) s.placeIds.push(pid) }
    else cities.set(n.city, { city: n.city, nights: 1, first: (ix.firstInCity.get(n.city) ?? '') >= aDate, range: [nightStart, nightEnd], placeIds: pid ? [pid] : [] })
  }
  const list = [...cities.values()]
  const km = Object.values(t.total_km_by_mode).reduce((s, x) => s + x, 0)
  return { kind: 'trip', trip: t, cities: list, title: list.map((c) => c.city).join(' · ') || t.anchor_cities.join(' · '), detail: `${t.nights} night${t.nights === 1 ? '' : 's'} · ${n0(km)} km`, range: [t.start, t.end], placeIds: t.memory?.destination_place_ids ?? list.flatMap((c) => c.placeIds) }
}

/** The legs within the trip (or the day), for a scoped map. O(log n + legs). */
export function routeRange(data: Data, h: Highlight): RouteAnswer | null {
  const range: [number, number] = h.trip ? [h.trip.start, h.trip.end] : h.range
  const acts = data.activities
  const kmByMode: Record<string, number> = {}
  let legs = 0, km = 0
  for (let i = Math.max(0, lastStarted(acts, range[0])); i < acts.length && acts[i].start <= range[1]; i++) {
    const a = acts[i]
    if (a.end < range[0]) continue
    legs++; km += a.m / 1000; kmByMode[a.mode] = (kmByMode[a.mode] ?? 0) + a.m / 1000
  }
  if (!legs) return null
  return { kind: 'route', legs, km, kmByMode, title: `${legs} leg${legs === 1 ? '' : 's'}`, detail: `${n0(km)} km · ${fmtSpan(localDay(range[0], h.tz), localDay(range[1], h.tz))}`, range, placeIds: h.placeIds, playhead: range[0] }
}

/** Where you were on this month/day in every year of the record; `now` marks today's year. O(years). */
export function compareYears(data: Data, h: Highlight, today = localToday()): CompareAnswer | null {
  const ix = indexOf(data)
  const y0 = new Date(data.meta.range[0] * 1000).getUTCFullYear(), y1 = new Date(data.meta.range[1] * 1000).getUTCFullYear()
  const years: YearCol[] = []
  const ids: string[] = []
  for (let y = y0; y <= y1; y++) {
    const date = sameDayIn(h.date, y)
    const d = ix.daily.get(date)
    if (!d) continue
    const visits = ix.byDay.get(date)
    const city = visits?.length ? cityOf(data, leadVisit(ix, visits)).city : d.cities[0] ?? null
    years.push({ year: y, city, km: ix.hasHome ? d.max_dist_from_home_km : null, now: y === yearOf(today) })
    if (visits) for (const v of visits) ids.push(v.place_id)
  }
  if (years.length < 2) return null
  const far = years.reduce((a, b) => ((b.km ?? 0) > (a.km ?? 0) ? b : a))
  const detail = ix.hasHome ? `farthest ${far.year}: ${far.city ?? 'unknown'}, ${n0(far.km ?? 0)} km` : years.map((y) => y.city ?? '—').join(' · ')
  return { kind: 'compare', years, title: `${years.length} years`, detail, range: [midnightUTC(sameDayIn(h.date, years[0].year)), midnightUTC(sameDayIn(h.date, years[years.length - 1].year)) + DAY], placeIds: [...new Set(ids)] }
}

/** Every stop that day with its hours, clipped to the day. O(visits on the day). */
export function whatDidIDo(data: Data, h: Highlight): DidAnswer | null {
  const ix = indexOf(data)
  const visits = ix.byDay.get(h.date) ?? []
  if (!visits.length) return null
  const stops: Stop[] = visits.map((v) => {
    const p = data.places[v.place_id]
    const s = Math.max(v.start, h.range[0]), e = Math.min(v.end, h.range[1])
    return { place_id: v.place_id, name: p?.name ?? p?.city ?? cityOf(data, v).city, type: p?.primary_type ?? null, hours: (e - s) / 3600, start: v.start, range: [s, e], placeIds: [v.place_id], playhead: s }
  })
  return { kind: 'did', stops, title: `${stops.length} stop${stops.length === 1 ? '' : 's'}`, detail: stops.map((s) => s.name).join(' · '), range: h.range, placeIds: stops.map((s) => s.place_id) }
}

/** Separate returns to the city after this stay ended, and the last of them. O(log n + distinct later days in the city). */
export function haveIBeenBack(data: Data, h: Highlight): BackAnswer | null {
  const ix = indexOf(data)
  if (!h.cityKnown) return null
  const days = ix.cityDays.get(h.city) ?? [], list = ix.byCity.get(h.city) ?? []
  const d0 = numOf(h.date)
  let lo = 0, hi = days.length - 1, i = days.length
  while (lo <= hi) { const m = (lo + hi) >> 1; if (days[m] > d0) { i = m; hi = m - 1 } else lo = m + 1 }
  // Consecutive days continue the same stay; a gap starts a return.
  let edge = d0, times = 0
  for (; i < days.length; i++) { if (days[i] > edge + 1) times++; edge = days[i] }
  const last = list[list.length - 1]
  if (!times || !last || last.start <= h.range[1]) {
    const yrs = Math.floor((data.meta.range[1] - h.range[1]) / (365 * DAY))
    return { kind: 'back', times: 0, last: null, title: 'Never', detail: `${yrs} year${yrs === 1 ? '' : 's'} and counting`, range: [h.range[1], data.meta.range[1]], placeIds: [] }
  }
  const lastDay = localDay(last.end, last.tz)
  return { kind: 'back', times, last: lastDay, title: times === 1 ? 'Once' : times === 2 ? 'Twice' : `${times} times`, detail: `last ${dmy(lastDay)}`, range: [dayStartIn(localDay(last.start, last.tz), last.tz), dayStartIn(lastDay, last.tz) + DAY], placeIds: [last.place_id], playhead: last.start }
}

/** This day's distance against the record's farthest. O(1) after the index. */
export function farthestEver(data: Data, h: Highlight): FarthestAnswer | null {
  const ix = indexOf(data)
  const far = ix.farthest
  if (!ix.hasHome || !far || !h.daily) return null
  const is = h.daily.max_dist_from_home_km >= far.max_dist_from_home_km
  const visits = ix.byDay.get(far.date)
  const city = visits?.length ? cityOf(data, leadVisit(ix, visits)).city : far.cities[0] ?? null
  const tz = visits?.[0]?.tz ?? h.tz
  return { kind: 'farthest', is, date: far.date, km: far.max_dist_from_home_km, city, title: is ? 'Yes' : 'No', detail: is ? `${n0(far.max_dist_from_home_km)} km, the farthest on record` : `${city ?? far.date}, ${n0(far.max_dist_from_home_km)} km, ${yearOf(far.date)}`, range: [dayStartIn(far.date, tz), dayStartIn(far.date, tz) + DAY], placeIds: [...new Set((visits ?? []).map((v) => v.place_id))], playhead: visits?.[0]?.start }
}

/** The same day one year before the highlight, as another highlight, if it scores. */
export function thisTimeLastYear(data: Data, h: Highlight): HighlightAnswer | null {
  const ix = indexOf(data)
  const date = sameDayIn(h.date, yearOf(h.date) - 1)
  if (!hasVisits(ix, date) || scoreDay(data, ix, date) <= 0) return null
  const hl = highlightOn(data, date, h.yearsAgo + 1)
  return { kind: 'highlight', highlight: hl, title: `${hl.verb} ${hl.city}`, detail: dmy(date), range: hl.range, placeIds: hl.placeIds, playhead: hl.playhead }
}

const QUESTIONS: [FollowUpId, string, (data: Data, h: Highlight, today: string) => Answer | null][] = [
  ['stay', 'How long did I stay?', stayLength],
  ['distance', 'How far from home?', distanceFromHome],
  ['trip', 'What else happened that trip?', tripSetlist],
  ['route', 'Show me the route', routeRange],
  ['compare', 'How does this compare to other years?', compareYears],
  ['did', 'What did I do that day?', whatDidIDo],
  ['back', 'Have I been back?', haveIBeenBack],
  ['farthest', 'Was this my farthest ever?', farthestEver],
  ['lastYear', 'What was I doing this time last year?', thisTimeLastYear],
]

/** Only the questions that have an answer for this highlight, answers pre-computed. Empty past MAX_DEPTH. */
export function followUps(data: Data, h: Highlight, depth = 0, exclude: Iterable<FollowUpId> = [], today = localToday()): FollowUp[] {
  if (depth >= MAX_DEPTH) return []
  const skip = new Set(exclude)
  const out: FollowUp[] = []
  for (const [id, question, fn] of QUESTIONS) {
    if (skip.has(id)) continue
    const answer = fn(data, h, today)
    if (answer) out.push({ id, question, answer })
  }
  return out
}
