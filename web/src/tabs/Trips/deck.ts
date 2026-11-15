import type { Data } from '../../data/types'
import { tripId } from '../../analytics/doors'

/** One trip as the deck deals it: the route, when, and the four figures the cards are compared on. */
export interface Card {
  tripId: string
  title: string
  departed: number
  returned: number
  nights: number
  /** Every mode added up, in the record's kilometres. */
  km: number
  flights: number
  farthestKm: number
}

export type Sign = -1 | 0 | 1
export interface Compared { nights: Sign; km: Sign; flights: Sign; farthest: Sign }

/** First index in `sorted` whose value is >= `t`. */
function lowerBound(sorted: number[], t: number): number {
  let lo = 0, hi = sorted.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < t) lo = mid + 1; else hi = mid }
  return lo
}

/**
 * The deck, newest trip first. Flights are counted off one sorted list of departure times with two binary
 * searches per trip, so a record of thousands of trips over a long flight log is O(A log A + T log A).
 */
export function deckCards(data: Data): Card[] {
  const starts: number[] = []
  for (const a of data.activities) if (a.mode === 'FLYING') starts.push(a.start)
  starts.sort((a, b) => a - b)
  return [...data.trips].sort((a, b) => b.start - a.start).map((t) => {
    let km = 0
    for (const v of Object.values(t.total_km_by_mode)) km += v
    return {
      tripId: tripId(t), title: t.anchor_cities.join(' → ') || 'TRIP',
      departed: t.start, returned: t.end, nights: t.nights, km,
      flights: lowerBound(starts, t.end + 1) - lowerBound(starts, t.start),
      farthestKm: t.max_dist_from_home_km,
    }
  })
}

const sign = (x: number): Sign => (x > 0 ? 1 : x < 0 ? -1 : 0)

/** Which card wins each stat: the sign of a − b. */
export function compare(a: Card, b: Card): Compared {
  return { nights: sign(a.nights - b.nights), km: sign(a.km - b.km), flights: sign(a.flights - b.flights), farthest: sign(a.farthestKm - b.farthestKm) }
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** What a card answers to: its route plus the month and year it departed, lower-cased. */
function haystack(c: Card): string {
  const d = new Date(c.departed * 1000)
  return `${c.title.toLowerCase()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** Cards whose route or departure month/year contains every token of `q` ("lisbon 2024"). Case-insensitive. */
export function searchCards(cards: Card[], q: string): Card[] {
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (!tokens.length) return cards
  return cards.filter((c) => { const h = haystack(c); return tokens.every((t) => h.includes(t)) })
}
