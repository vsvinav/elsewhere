import { describe, expect, it } from 'vitest'
import { atPlayhead, cumulative, resolveGrain } from './timeline'
import type { Data } from '../data/types'
import { sampleData } from '../test/sample'

const T = (iso: string) => Date.parse(iso) / 1000
const D = 86400

/** A small record: home in Lisbon, a visit to Porto (new city) with a drive there, a flight to Paris, a return. */
function tiny(): Data {
  const base = sampleData()
  const places = {
    home: { ...base.places[Object.keys(base.places)[0]], lat: 38.72, lng: -9.14, city: 'Lisbon', country_code: 'PT', role: 'home' as const, name: 'Home' },
    porto: { ...base.places[Object.keys(base.places)[0]], lat: 41.15, lng: -8.61, city: 'Porto', country_code: 'PT', role: null, name: 'Porto' },
    paris: { ...base.places[Object.keys(base.places)[0]], lat: 48.86, lng: 2.35, city: 'Paris', country_code: 'FR', role: null, name: 'Paris' },
  }
  const v = (id: number, start: string, end: string, place_id: string) => ({ id, start: T(start), end: T(end), tz: 0, place_id, lat: places[place_id as keyof typeof places].lat, lng: places[place_id as keyof typeof places].lng, type: 'UNKNOWN', p: 1, lvl: 0 })
  const a = (id: number, start: string, end: string, mode: string, m: number, from: keyof typeof places, to: keyof typeof places) => ({ id, start: T(start), end: T(end), tz: 0, s_lat: places[from].lat, s_lng: places[from].lng, e_lat: places[to].lat, e_lng: places[to].lng, m, mode, p: 1 })
  return {
    ...base, places, paths: [], strokes: [],
    visits: [v(1, '2024-01-01T00:00:00Z', '2024-01-05T08:00:00Z', 'home'), v(2, '2024-01-05T12:00:00Z', '2024-01-07T10:00:00Z', 'porto'), v(3, '2024-01-07T14:00:00Z', '2024-01-10T10:00:00Z', 'paris'), v(4, '2024-01-10T14:00:00Z', '2024-01-20T00:00:00Z', 'home'), v(5, '2024-02-01T12:00:00Z', '2024-02-02T10:00:00Z', 'porto')],
    activities: [a(1, '2024-01-05T08:00:00Z', '2024-01-05T12:00:00Z', 'IN_PASSENGER_VEHICLE', 300_000, 'home', 'porto'), a(2, '2024-01-07T10:00:00Z', '2024-01-07T14:00:00Z', 'FLYING', 1_200_000, 'porto', 'paris'), a(3, '2024-01-10T10:00:00Z', '2024-01-10T14:00:00Z', 'FLYING', 1_450_000, 'paris', 'home')],
    profile: { ...base.profile, home: { lat: 38.72, lng: -9.14 } },
    meta: { ...base.meta, range: [T('2024-01-01T00:00:00Z'), T('2024-02-03T00:00:00Z')] },
  }
}

describe('cumulative', () => {
  it('builds non-decreasing prefix arrays keyed by event time', () => {
    const c = cumulative(tiny())
    for (const k of ['km', 'cities', 'nightsAway', 'flights'] as const) for (let i = 1; i < c.ts.length; i++) expect(c[k][i]).toBeGreaterThanOrEqual(c[k][i - 1])
    for (let i = 1; i < c.ts.length; i++) expect(c.ts[i]).toBeGreaterThanOrEqual(c.ts[i - 1])
  })
  it('counts a city once however often it is visited, and only legs flown as flights', () => {
    const c = cumulative(tiny())
    const end = atPlayhead(c, T('2024-02-03T00:00:00Z'))
    expect(end.cities).toBe(3)        // Lisbon, Porto, Paris; the February Porto visit adds nothing
    expect(end.flights).toBe(2)
    expect(end.km).toBeCloseTo(2950, 0)
  })
  it('is all zeros before the first event and exact at an event boundary', () => {
    const c = cumulative(tiny())
    expect(atPlayhead(c, T('2023-12-01T00:00:00Z'))).toMatchObject({ km: 0, cities: 0, nightsAway: 0, flights: 0, milestone: null })
    const atPorto = atPlayhead(c, T('2024-01-05T12:00:00Z'))
    expect(atPorto.cities).toBe(2)
    expect(atPlayhead(c, T('2024-01-05T11:59:59Z')).cities).toBe(1)
  })
  it('counts away nights from the beds strip', () => {
    const c = cumulative(tiny())
    // Nights of Jan 5→6, 6→7 in Porto and 7→8, 8→9, 9→10 in Paris, each counted at the midnight it crosses.
    expect(atPlayhead(c, T('2024-01-05T23:00:00Z')).nightsAway).toBe(0)
    expect(atPlayhead(c, T('2024-01-06T00:00:00Z')).nightsAway).toBe(1)
    expect(atPlayhead(c, T('2024-01-10T00:00:00Z')).nightsAway).toBe(5)
    expect(atPlayhead(c, T('2024-01-10T23:00:00Z')).nightsAway).toBe(5)
  })
  it('emits every 10,000 km mark a single long leg crosses', () => {
    const d = tiny()
    d.activities = [{ ...d.activities[1], m: 21_000_000 }]
    const c = cumulative(d)
    expect(c.milestones.filter((m) => m.text.endsWith('km so far')).map((m) => m.text)).toEqual(['10,000 km so far', '20,000 km so far'])
  })
  it('is built once per record', () => {
    const d = tiny()
    expect(cumulative(d)).toBe(cumulative(d))
  })
})

describe('milestones', () => {
  it('fires once at the event that reaches it and lingers for 2% of the range', () => {
    const c = cumulative(tiny())
    const first = c.milestones.find((m) => m.text === 'your first city')
    expect(first).toBeDefined()
    expect(c.milestones.filter((m) => m.text === 'your first city')).toHaveLength(1)
    const span = T('2024-02-03T00:00:00Z') - T('2024-01-01T00:00:00Z')
    expect(atPlayhead(c, first!.ts).milestone).toBe('your first city')
    expect(atPlayhead(c, first!.ts + span * 0.019).milestone).toBe('your first city')
    expect(atPlayhead(c, first!.ts + span * 0.021).milestone).toBeNull()
  })
})

describe('resolveGrain', () => {
  it('offers only day on a short record', () => {
    const d = tiny()
    d.meta.range = [0, 10 * D]
    expect(resolveGrain(d, 'year')).toEqual({ grain: 'day', allowed: ['day'] })
  })
  it('opens on day so the trail plays, and offers every grain when there are trips', () => {
    const d = tiny()
    d.meta.range = [0, 500 * D]
    d.trips = [{ start: 0, end: D, nights: 1, max_dist_from_home_km: 300, total_km_by_mode: {}, anchor_cities: ['Porto'], memory: null }]
    expect(resolveGrain(d, null)).toEqual({ grain: 'day', allowed: ['year', 'month', 'day'] })
    expect(resolveGrain(d, 'year').grain).toBe('year')
  })
  it('drops year without trips and falls back to day', () => {
    const d = tiny()
    d.meta.range = [0, 500 * D]
    d.trips = []
    expect(resolveGrain(d, 'year')).toEqual({ grain: 'day', allowed: ['month', 'day'] })
  })
})
