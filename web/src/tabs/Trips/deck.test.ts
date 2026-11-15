import { compare, deckCards, searchCards, type Card } from './deck'
import type { Activity, Data, Trip } from '../../data/types'

const D = 86400
const utc = (y: number, m0: number, d = 1) => Date.UTC(y, m0, d) / 1000
const trip = (start: number, nights: number, cities: string[], km: Record<string, number>, far: number): Trip =>
  ({ start, end: start + nights * D, nights, anchor_cities: cities, total_km_by_mode: km, max_dist_from_home_km: far, memory: null })
const fly = (start: number, mode = 'FLYING'): Activity => ({ id: 0, start, end: start + 3600, tz: 0, s_lat: 0, s_lng: 0, e_lat: 1, e_lng: 1, m: 500_000, mode, p: 1 })

const lisbon = trip(utc(2024, 4, 10), 7, ['Lisbon', 'Sintra'], { FLYING: 10_000, WALKING: 60 }, 5180)
const tokyo = trip(utc(2023, 9, 2), 4, ['Tokyo'], { FLYING: 21_600 }, 10_800)
const nyc = trip(utc(2025, 1, 14), 2, [], { IN_TRAIN: 700, WALKING: 18 }, 306)
const data = {
  trips: [lisbon, tokyo, nyc],
  activities: [
    fly(lisbon.start), fly(lisbon.end), fly(lisbon.start - 1), fly(lisbon.end + 1), // both ends inclusive, one second outside is out
    fly(tokyo.start + D), fly(tokyo.start + 2 * D, 'IN_TRAIN'), // only flights count
    fly(nyc.start + D, 'IN_TRAIN'),
  ].sort(() => 0.5 - Math.random()),
} as unknown as Data

describe('deckCards', () => {
  const cards = deckCards(data)
  it('deals newest first with route, nights, km, flights and the farthest point', () => {
    expect(cards.map((c) => c.title)).toEqual(['TRIP', 'Lisbon → Sintra', 'Tokyo'])
    expect(cards.map((c) => c.nights)).toEqual([2, 7, 4])
    expect(cards.map((c) => c.km)).toEqual([718, 10_060, 21_600])
    expect(cards.map((c) => c.farthestKm)).toEqual([306, 5180, 10_800])
    expect(cards[1]).toMatchObject({ tripId: `${lisbon.start}-${lisbon.end}`, departed: lisbon.start, returned: lisbon.end })
  })
  it('counts flights whose start falls inside the trip, boundaries included', () => {
    expect(cards.map((c) => c.flights)).toEqual([0, 2, 1])
  })
  it('a record with no flights or no trips is fine', () => {
    expect(deckCards({ trips: [lisbon], activities: [] } as unknown as Data)[0].flights).toBe(0)
    expect(deckCards({ trips: [], activities: data.activities } as unknown as Data)).toEqual([])
  })
  it('scales: 2,000 trips over 200k activities build in one pass, not one scan per trip', () => {
    const t0 = utc(2000, 0)
    const trips = Array.from({ length: 2000 }, (_, i) => trip(t0 + i * 5 * D, 3, ['X'], { FLYING: 1 }, 1))
    const acts = Array.from({ length: 200_000 }, (_, i) => fly(t0 + i * 4320))
    const start = performance.now()
    const out = deckCards({ trips, activities: acts } as unknown as Data)
    const ms = performance.now() - start
    expect(out).toHaveLength(2000)
    expect(out.every((c) => c.flights === 3 * D / 4320 + 1)).toBe(true)
    expect(ms).toBeLessThan(300)
  })
})

describe('compare', () => {
  const c = (o: Partial<Card>): Card => ({ tripId: '', title: '', departed: 0, returned: 0, nights: 0, km: 0, flights: 0, farthestKm: 0, ...o })
  it('gives the sign of a − b per stat', () => {
    expect(compare(c({ nights: 7, km: 100, flights: 2, farthestKm: 5 }), c({ nights: 4, km: 100, flights: 3, farthestKm: 5 }))).toEqual({ nights: 1, km: 0, flights: -1, farthest: 0 })
    expect(compare(c({ nights: 1 }), c({ nights: 2 }))).toMatchObject({ nights: -1 })
  })
})

describe('searchCards', () => {
  const cards = deckCards(data)
  it('matches every token against the route and the month or year departed, case-insensitively', () => {
    expect(searchCards(cards, 'lisbon').map((c) => c.title)).toEqual(['Lisbon → Sintra'])
    expect(searchCards(cards, 'LISBON 2024')).toHaveLength(1)
    expect(searchCards(cards, 'lisbon 2023')).toHaveLength(0)
    expect(searchCards(cards, 'may')).toHaveLength(1)
    expect(searchCards(cards, '2025').map((c) => c.title)).toEqual(['TRIP'])
    expect(searchCards(cards, 'sin')).toHaveLength(1)
  })
  it('an empty query is every card', () => {
    expect(searchCards(cards, '  ')).toBe(cards)
  })
})
