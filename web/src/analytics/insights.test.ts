import { wrappedFacts } from './wrapped'
import { homeFacts } from './home'
import { explorationScore, placeStatuses } from './explore'
import { commuteStats } from './commute'
import type { Data } from '../data/types'

const H = 3600, D = 86400
const JAN = Date.UTC(2025, 0, 1) / 1000, FEB = Date.UTC(2025, 1, 1) / 1000, MAR = Date.UTC(2025, 2, 1) / 1000
const v = (start: number, end: number, place_id: string, type = 'UNKNOWN', lvl = 0, lng = 0, lat = 0) =>
  ({ start, end, place_id, type, lvl, lng, lat, tz: 0, id: 0, p: 1 })
const a = (start: number, end: number, mode: string, m: number) =>
  ({ start, end, mode, m, s_lng: 0, s_lat: 0, e_lng: 1, e_lat: 1, tz: 0, id: 0, p: 1 })

const data = {
  visits: [
    v(JAN, JAN + 8 * H, 'home', 'INFERRED_HOME'),
    v(JAN + 9 * H, JAN + 17 * H, 'work', 'INFERRED_WORK'),
    v(JAN + 18 * H, JAN + 30 * H, 'home', 'INFERRED_HOME'),
    v(JAN + 31 * H, JAN + 32 * H, 'cafe'),
    v(JAN + 32 * H, JAN + 33 * H, 'cafe-nested', 'UNKNOWN', 1),
    v(FEB, FEB + H, 'cafe'),
    v(FEB + 2 * H, FEB + 3 * H, 'museum'),
  ],
  activities: [
    a(JAN + 8 * H, JAN + 8.5 * H, 'WALKING', 1000),
    a(JAN + 8.5 * H, JAN + 9 * H, 'IN_SUBWAY', 5000),
    a(JAN + 17 * H, JAN + 18 * H, 'IN_PASSENGER_VEHICLE', 6000),
    a(FEB + 1.2 * H, FEB + 1.8 * H, 'FLYING', 500000),
  ],
  paths: [],
  places: {
    home: { lng: 0, lat: 0, semantic_type: 'INFERRED_HOME', city: 'Boston', country_code: 'US', n_visits: 2, first_ts: JAN, last_ts: JAN + 18 * H, name: null },
    work: { lng: 0, lat: 0, semantic_type: 'INFERRED_WORK', city: 'Boston', country_code: 'US', n_visits: 1, first_ts: JAN, last_ts: JAN, name: null },
    cafe: { lng: 0, lat: 0, semantic_type: 'UNKNOWN', city: 'Boston', country_code: 'US', n_visits: 2, first_ts: JAN + 31 * H, last_ts: FEB, name: 'Cafe' },
    museum: { lng: 0, lat: 0, semantic_type: 'UNKNOWN', city: 'Paris', country_code: 'FR', n_visits: 1, first_ts: FEB + 2 * H, last_ts: FEB + 2 * H, name: 'Louvre' },
    old: { lng: 0, lat: 0, semantic_type: 'UNKNOWN', city: 'Boston', country_code: 'US', n_visits: 5, first_ts: JAN - 200 * D, last_ts: JAN - 80 * D, name: 'Gym' },
  },
  daily: [{ date: '2025-01-01', km_by_mode: { WALKING: 1 }, n_places: 3, cities: ['Boston'] }],
  trips: [],
  profile: { home: { lng: 0, lat: 0 } },
  meta: { range: [JAN, MAR] },
} as unknown as Data

test('wrappedFacts builds cards from the range', () => {
  const cards = wrappedFacts(data, [JAN, MAR])
  const heads = cards.map((c) => c.headline)
  expect(heads[0]).toMatch(/days on the move/)
  expect(cards[0].detail).toBe('4 places · 2 cities · 2 countries')
  expect(heads).toContainEqual(expect.stringMatching(/1 flight/))
  expect(heads).toContain('Cafe')
  expect(heads).toContain('3 places in one day')
  expect(cards.find((c) => c.arcs)?.arcs).toHaveLength(1)
  expect(wrappedFacts(data, [MAR + 10 * D, MAR + 20 * D])).toEqual([])
})

test('explorationScore buckets by month, excluding home/work and nested visits', () => {
  const b = explorationScore(data, [JAN, FEB + 10 * D])
  expect(b.map((x) => x.key)).toEqual(['2025-01', '2025-02'])
  expect(b[0]).toMatchObject({ new: 1, repeat: 0 })
  expect(b[1]).toMatchObject({ new: 1, repeat: 1 })
  // 'old' (5 visits, last seen 80 days before Jan 1) crosses the 90-day line in January
  expect(b[0].lapsed).toBe(1)
  expect(b[1].lapsed).toBe(0)
})

test('placeStatuses flags new / repeat / lapsed', () => {
  const s = Object.fromEntries(placeStatuses(data, [FEB, MAR]).map((p) => [p.place_id, p.status]))
  expect(s).toEqual({ cafe: 'repeat', museum: 'new', old: 'lapsed' })
})

test('commuteStats finds both legs with modes and durations', () => {
  const c = commuteStats(data, [JAN, MAR])
  expect(c.legs).toHaveLength(2)
  expect(c.to_work).toMatchObject({ n: 1, median_min: 60, by_mode: { WALKING: 1, IN_SUBWAY: 1 } })
  expect(c.to_home).toMatchObject({ n: 1, median_min: 60, by_mode: { IN_PASSENGER_VEHICLE: 1 } })
  expect(c.to_work.by_hour[8]).toBe(1)
  expect(c.to_work.by_weekday[2]).toBe(1) // 2025-01-01 is a Wednesday
  expect(c.legs[0].path).toHaveLength(6)
})

test('homeFacts totals the export, excludes home/work from third places, and rolls up years', () => {
  const f = homeFacts(data)
  expect(f.totalKm).toBeCloseTo(512)
  expect(f.kmByMode[0]).toEqual(['FLYING', 500])
  expect(f.places).toBe(4)
  expect(f.countries).toBe(2)
  expect(f.topCities[0]).toBe('Boston')
  expect(f.thirdPlaces.map((p) => p.name)).toEqual(['Gym', 'Cafe', 'Louvre'])
  expect(f.records.busiestDay).toEqual({ date: '2025-01-01', places: 3 })
  expect(f.years).toEqual([{ year: 2025, km: 512, places: 4, trips: 0, flights: 1 }])
})
