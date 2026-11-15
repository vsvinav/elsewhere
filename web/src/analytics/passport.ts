import type { Data } from '../data/types'
import type { Door } from '../store/useStore'
import { tour, type Stop } from './tour'

export interface Stamp { id: string; label: string; earnedAt: number | null; door: Door | null; sub?: string }
export interface Page { kind: 'country' | 'milestone'; id: string; title: string; stamps: Stamp[] }
export interface Passport { pages: Page[] }

const DAY = 86400
const EARTH_KM = 40_075
const NIGHTS = [10, 100, 1_000], CITIES = [5, 25, 100], COUNTRIES = [3, 10, 25], ZONES = 10
/** Stops with no country go on a page of their own. */
export const ELSEWHERE = 'ELSEWHERE'

const n0 = (x: number) => x.toLocaleString('en-US')
const nights = (n: number) => (n === 1 ? '1 night' : `${n} nights`)

/** A milestone opens the map on the day it was earned, with a day either side. */
const around = (earnedAt: number | null, label: string): Door | null => (earnedAt == null ? null : { kind: 'range', from: earnedAt - DAY, to: earnedAt + DAY, label })
const milestone = (id: string, label: string, earnedAt: number | null): Stamp => ({ id: `ms:${id}`, label, earnedAt, door: around(earnedAt, label) })

/**
 * Pages per country and per milestone, every stamp dated when it was earned or left as an outline to aim for.
 * One sorted pass over the stops, one over the activities, one over the visits: O(S log S + A + V).
 */
export function passport(data: Data): Passport {
  const stops = [...tour(data).stops].sort((a, b) => a.first - b.first)
  const byCountry = new Map<string, Stop[]>()
  for (const s of stops) {
    const k = s.country ?? ELSEWHERE
    const list = byCountry.get(k)
    if (list) list.push(s); else byCountry.set(k, [s])
  }
  // Insertion order is first-earned order, since the stops were sorted before grouping.
  const pages: Page[] = [...byCountry.entries()].map(([cc, list]) => ({
    kind: 'country', id: `country:${cc}`, title: cc.toUpperCase(),
    stamps: list.map((s) => ({ id: `city:${s.city}`, label: s.city.toUpperCase(), earnedAt: s.first, sub: nights(s.nights), door: { kind: 'places', placeIds: s.placeIds, label: s.city } })),
  }))

  // Nights, cities and countries all fall out of the same chronological walk.
  const nightAt: (number | null)[] = NIGHTS.map(() => null)
  const cityAt: (number | null)[] = CITIES.map(() => null)
  const countryAt: (number | null)[] = COUNTRIES.map(() => null)
  const seen = new Set<string>()
  let cum = 0
  stops.forEach((s, i) => {
    NIGHTS.forEach((n, k) => { if (nightAt[k] == null && cum < n && cum + s.nights >= n) nightAt[k] = s.first + (n - cum - 1) * DAY })
    cum += s.nights
    CITIES.forEach((n, k) => { if (i + 1 === n) cityAt[k] = s.first })
    if (s.country && !seen.has(s.country)) { seen.add(s.country); COUNTRIES.forEach((n, k) => { if (seen.size === n) countryAt[k] = s.first }) }
  })

  let km = 0, lapAt: number | null = null
  for (const a of data.activities) { km += a.m / 1000; if (km >= EARTH_KM) { lapAt = a.end; break } }

  const zones = new Set<number>()
  let zoneAt: number | null = null
  for (const v of data.visits) {
    if (v.lvl !== 0 || zones.has(v.tz)) continue
    zones.add(v.tz)
    if (zones.size === ZONES) { zoneAt = v.start; break }
  }

  pages.push({
    kind: 'milestone', id: 'milestones', title: 'MILESTONES',
    stamps: [
      milestone('first-night', 'FIRST NIGHT AWAY', stops[0]?.first ?? null),
      ...NIGHTS.map((n, k) => milestone(`nights-${n}`, `${n0(n)} NIGHTS AWAY`, nightAt[k])),
      ...CITIES.map((n, k) => milestone(`cities-${n}`, `${n0(n)} CITIES`, cityAt[k])),
      ...COUNTRIES.map((n, k) => milestone(`countries-${n}`, `${n0(n)} COUNTRIES`, countryAt[k])),
      milestone('lap', '1 LAP OF EARTH', lapAt),
      milestone('zones', `${ZONES} TIME ZONES`, zoneAt),
    ],
  })
  return { pages }
}

export const earnedIds = (p: Passport) => p.pages.flatMap((pg) => pg.stamps.filter((s) => s.earnedAt != null).map((s) => s.id))

/** A stamp's lean on the page, ±6°, the same every time it prints. FNV-1a over the id. */
export function tilt(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  return (h % 1201) / 100 - 6
}
