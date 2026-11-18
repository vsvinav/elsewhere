import type { Data } from '../data/types'
import { legsOf } from './legs'
import { bedStrip } from './beds'
import { distanceKm } from './position'

/** How coarsely the Replay draws time: trips, city stops, or the raw day. */
export type Grain = 'year' | 'month' | 'day'
export const GRAINS: Grain[] = ['year', 'month', 'day']
export const GRAIN_LABEL: Record<Grain, string> = { year: 'Year', month: 'Month', day: 'Day' }

export interface Cumulative {
  ts: number[]; km: number[]; cities: number[]; nightsAway: number[]; flights: number[]
  milestones: { ts: number; text: string }[]
  span: number
}
export interface Rail { km: number; cities: number; nightsAway: number; flights: number; milestone: string | null }

const DAY = 86400
const LINGER = 0.02
const ORD = (n: number) => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`
const CITY_MARKS = [1, 10, 25, 50, 100, 200]
const NIGHT_MARKS = [100, 365]
const FLIGHT_MARKS = [10, 50, 100]
const KM_EVERY = 10_000

type Ev = { ts: number; km?: number; city?: string; night?: true; flight?: true }

const cache = new WeakMap<Data, Cumulative>()

/** Prefix sums of the record in event order, built once per Data. */
export function cumulative(data: Data): Cumulative {
  const hit = cache.get(data); if (hit) return hit
  const evs: Ev[] = []
  legsOf(data).forEach((l, i) => {
    if (!l.ts.length) return
    // The export's own metres when it has them; the drawn path is only a guess for legs without GPS.
    const m = data.activities[i]?.m ?? 0
    const km = m > 0 ? m / 1000 : pathKm(l.path)
    evs.push({ ts: l.ts[l.ts.length - 1], km, flight: l.lens === 'fly' || undefined })
  })
  for (const v of data.visits) {
    if (v.lvl !== 0) continue
    const city = data.places[v.place_id]?.city
    if (city) evs.push({ ts: v.start, city })
  }
  for (const n of bedStrip(data)) if (n.kind === 'new' || n.kind === 'repeat') evs.push({ ts: Date.parse(n.date) / 1000, night: true })
  evs.sort((a, b) => a.ts - b.ts)

  const out: Cumulative = { ts: [], km: [], cities: [], nightsAway: [], flights: [], milestones: [], span: data.meta.range[1] - data.meta.range[0] }
  const seen = new Set<string>()
  let km = 0, cities = 0, nights = 0, flights = 0, kmMark = KM_EVERY
  for (const e of evs) {
    if (e.km) { km += e.km; while (km >= kmMark) { out.milestones.push({ ts: e.ts, text: `${kmMark.toLocaleString('en-US')} km so far` }); kmMark += KM_EVERY } }
    if (e.flight) { flights++; if (FLIGHT_MARKS.includes(flights)) out.milestones.push({ ts: e.ts, text: `your ${ORD(flights)} flight` }) }
    if (e.city && !seen.has(e.city)) { seen.add(e.city); cities++; if (CITY_MARKS.includes(cities)) out.milestones.push({ ts: e.ts, text: cities === 1 ? 'your first city' : `…and that's your ${ORD(cities)} city` }) }
    if (e.night) { nights++; if (NIGHT_MARKS.includes(nights)) out.milestones.push({ ts: e.ts, text: `${nights} nights away` }) }
    out.ts.push(e.ts); out.km.push(km); out.cities.push(cities); out.nightsAway.push(nights); out.flights.push(flights)
  }
  cache.set(data, out)
  return out
}

/** The figures as they stood at `t`: the last event at or before it, zeros before the first. */
export function atPlayhead(c: Cumulative, t: number): Rail {
  let lo = 0, hi = c.ts.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (c.ts[mid] <= t) lo = mid + 1; else hi = mid }
  const i = lo - 1
  let milestone: string | null = null
  for (let m = c.milestones.length - 1; m >= 0; m--) { const ms = c.milestones[m]; if (ms.ts <= t) { if (t - ms.ts <= LINGER * c.span) milestone = ms.text; break } }
  return i < 0 ? { km: 0, cities: 0, nightsAway: 0, flights: 0, milestone } : { km: c.km[i], cities: c.cities[i], nightsAway: c.nightsAway[i], flights: c.flights[i], milestone }
}

/** The grain to draw and the ones on offer. Replay opens on day — the trail — unless a coarser grain is picked; short records are day only; year needs trips to draw. */
export function resolveGrain(data: Data, picked: Grain | null): { grain: Grain; allowed: Grain[] } {
  const span = data.meta.range[1] - data.meta.range[0]
  const allowed: Grain[] = span <= 21 * DAY ? ['day'] : data.trips.length > 0 ? [...GRAINS] : ['month', 'day']
  const grain = picked && allowed.includes(picked) ? picked : 'day'
  return { grain, allowed }
}

function pathKm(path: [number, number][]): number {
  let km = 0
  for (let i = 1; i < path.length; i++) km += distanceKm({ lng: path[i - 1][0], lat: path[i - 1][1] }, { lng: path[i][0], lat: path[i][1] })
  return km
}
