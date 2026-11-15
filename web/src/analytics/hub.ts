import type { Data } from '../data/types'
import { bedStrip, longestRun } from './beds'
import { isHome } from './geo'

/*
 * The Play hub deck: the few figures its cards print that no other tab already has. Everything is
 * one pass over the record (O(visits + activities + days)) and the per-year index is built once per
 * record identity, so a card never recomputes on a swipe.
 */

const DAY = 86400

/** FNV-1a over the text, the same walk the barcode takes. */
export function fnv(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  return h
}

/** The fact for the day: the date hashed onto the list, so it turns daily and reads the same all day. */
export function todaysFact<T>(list: T[], date: string): T | null {
  return list.length ? list[fnv(date) % list.length] : null
}

export interface Run { from: string; to: string; n: number }
export interface Streaks {
  /** Longest run of consecutive nights away from home. */
  away: Run | null
  /** Longest run of consecutive weeks (Monday to Sunday) with a new place in each; dates span those weeks. */
  newWeeks: Run | null
  /** Nights away in a row at the end of the record; 0 when it ends at home. */
  current: number
}

const dayNum = (date: string) => Date.parse(date + 'T00:00:00Z') / 1000 / DAY
const dateOf = (n: number) => new Date(n * DAY * 1000).toISOString().slice(0, 10)
/** Monday-based week index: the epoch fell on a Thursday, three days after a Monday. */
const weekOf = (date: string) => Math.floor((dayNum(date) + 3) / 7)
const mondayOf = (week: number) => dateOf(week * 7 - 3)

export function streaks(data: Data): Streaks {
  if (!data.visits.length && !data.daily.length) return { away: null, newWeeks: null, current: 0 }
  const nights = data.visits.length ? bedStrip(data) : []
  const isAway = (n: { kind: string }) => n.kind === 'new' || n.kind === 'repeat'
  const away = longestRun(nights, isAway)
  let current = 0
  for (let i = nights.length - 1; i >= 0; i--) {
    if (nights[i].kind === 'none') continue
    if (!isAway(nights[i])) break
    current++
  }
  // Daily rows come in date order; distinct weeks with a new place, then the longest chain of adjacent ones.
  let newWeeks: Run | null = null
  let run: { w0: number; w1: number } | null = null
  for (const d of data.daily) {
    if (d.n_new_places <= 0) continue
    const w = weekOf(d.date)
    if (run && w === run.w1) continue
    run = run && w === run.w1 + 1 ? { w0: run.w0, w1: w } : { w0: w, w1: w }
    const n = run.w1 - run.w0 + 1
    if (!newWeeks || n > newWeeks.n) newWeeks = { from: mondayOf(run.w0), to: dateOf(run.w1 * 7 - 3 + 6), n }
  }
  return { away, newWeeks, current }
}

export interface YearFacts { year: number; places: number; nightsAway: number; km: number; countries: number }

const YEARS = new WeakMap<Data, Map<number, YearFacts>>()
const localYear = (ts: number, tz: number) => new Date((ts + tz * 60) * 1000).getUTCFullYear()

/** Per calendar year: distinct places slept or stopped at away from home, nights away, kilometres moved, countries. */
function yearIndex(data: Data): Map<number, YearFacts> {
  const hit = YEARS.get(data)
  if (hit) return hit
  const acc = new Map<number, { f: YearFacts; places: Set<string>; countries: Set<string> }>()
  const of = (y: number) => { let a = acc.get(y); if (!a) { a = { f: { year: y, places: 0, nightsAway: 0, km: 0, countries: 0 }, places: new Set(), countries: new Set() }; acc.set(y, a) } return a }
  for (const v of data.visits) {
    if (v.lvl !== 0) continue
    const p = data.places[v.place_id]
    if (isHome(p)) continue
    const a = of(localYear(v.start, v.tz))
    a.places.add(v.place_id)
    if (p?.country_code) a.countries.add(p.country_code)
  }
  for (const x of data.activities) of(localYear(x.start, x.tz)).f.km += x.m / 1000
  if (data.visits.length) for (const n of bedStrip(data)) if (n.kind === 'new' || n.kind === 'repeat') of(Number(n.date.slice(0, 4))).f.nightsAway++
  const out = new Map<number, YearFacts>()
  for (const [y, a] of [...acc.entries()].sort((p, q) => p[0] - q[0])) out.set(y, { ...a.f, places: a.places.size, countries: a.countries.size })
  YEARS.set(data, out)
  return out
}

/** Years the record touches, oldest first. */
export const yearsWithData = (data: Data): number[] => [...yearIndex(data).keys()]

/** Two years side by side; a year with nothing on record prints zeros. */
export function compareYears(data: Data, a: number, b: number): [YearFacts, YearFacts] {
  const ix = yearIndex(data)
  const of = (y: number) => ix.get(y) ?? { year: y, places: 0, nightsAway: 0, km: 0, countries: 0 }
  return [of(a), of(b)]
}

/** The next year with data after `cur`, wrapping, never the one on the other chip. */
export function cycleYear(years: number[], cur: number, other: number): number {
  const n = years.length
  if (n < 2) return cur
  let i = years.indexOf(cur)
  for (let k = 0; k < n; k++) { i = (i + 1) % n; if (years[i] !== other) return years[i] }
  return cur
}

export interface Peak { d: number; h: number; v: number }

/** The hottest cell of a weekday × hour grid, or null when nothing was away. */
export function busiest(rhythm: number[][]): Peak | null {
  let best: Peak | null = null
  rhythm.forEach((row, d) => row.forEach((v, h) => { if (v > 0 && (!best || v > best.v)) best = { d, h, v } }))
  return best
}
