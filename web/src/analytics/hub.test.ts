import { busiest, compareYears, cycleYear, streaks, todaysFact, yearsWithData } from './hub'
import type { Data } from '../data/types'

const H = 3600, D = 86400
const at = (y: number, m: number, d: number, h = 0) => Date.UTC(y, m - 1, d, h) / 1000
const v = (start: number, end: number, place_id: string, lat: number, lng: number) => ({ start, end, place_id, type: 'UNKNOWN', lvl: 0, lng, lat, tz: 0, id: 0, p: 1 })
const place = (role: 'home' | null, city: string, country_code: string, lat: number, lng: number) =>
  ({ lng, lat, role, city, country_code, n_visits: 1, first_ts: 0, last_ts: 0, name: null, total_hours: 1, label: null })
const day = (date: string, n_new_places: number) => ({ date, km_by_mode: {}, n_visits: 1, n_places: 1, n_new_places, max_dist_from_home_km: 0, hours_home: 0, hours_work: 0, hours_other: 0, hours_transit: 0, cities: [] })

// 2024: three nights home, then Paris for two nights and Lyon for one (new, new, new), home again.
// 2025: home, two nights in Paris (repeat), then the record ends away.
const data = {
  visits: [
    v(at(2024, 1, 1), at(2024, 1, 4, 12), 'home', 42.36, -71.06),
    v(at(2024, 1, 4, 20), at(2024, 1, 6, 12), 'paris', 48.85, 2.35),
    v(at(2024, 1, 6, 14), at(2024, 1, 7, 12), 'lyon', 45.76, 4.84),
    v(at(2024, 1, 7, 20), at(2024, 1, 9, 12), 'home', 42.36, -71.06),
    v(at(2025, 3, 1), at(2025, 3, 2, 12), 'home', 42.36, -71.06),
    v(at(2025, 3, 2, 20), at(2025, 3, 4, 12), 'paris', 48.85, 2.35),
  ],
  activities: [
    { start: at(2024, 1, 4, 13), end: at(2024, 1, 4, 19), mode: 'FLYING', m: 5_500_000, s_lat: 42.36, s_lng: -71.06, e_lat: 48.85, e_lng: 2.35, tz: 0, id: 0, p: 1 },
    { start: at(2025, 3, 2, 13), end: at(2025, 3, 2, 19), mode: 'FLYING', m: 5_500_000, s_lat: 42.36, s_lng: -71.06, e_lat: 48.85, e_lng: 2.35, tz: 0, id: 1, p: 1 },
    { start: at(2025, 3, 3, 10), end: at(2025, 3, 3, 11), mode: 'WALKING', m: 4_000, s_lat: 48.85, s_lng: 2.35, e_lat: 48.86, e_lng: 2.36, tz: 0, id: 2, p: 1 },
  ],
  paths: [], strokes: [],
  places: {
    home: place('home', 'Boston', 'US', 42.36, -71.06),
    paris: place(null, 'Paris', 'FR', 48.85, 2.35),
    lyon: place(null, 'Lyon', 'FR', 45.76, 4.84),
  },
  // New places on three consecutive weeks of January 2024 (Mon 1, Mon 8, Mon 15), then one lone week in March 2025.
  daily: [day('2024-01-04', 1), day('2024-01-10', 2), day('2024-01-16', 1), day('2024-01-30', 1), day('2025-03-03', 1)],
  trips: [],
  profile: { home: { lat: 42.36, lng: -71.06 } },
  meta: { range: [at(2024, 1, 1), at(2025, 3, 4, 12)] },
} as unknown as Data

test('todaysFact picks the same fact for the same day and another on another day', () => {
  const list = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
  expect(todaysFact(list, '2025-11-15')).toBe(todaysFact(list, '2025-11-15'))
  const picks = new Set(['2025-11-15', '2025-11-16', '2025-11-17', '2025-11-18', '2025-11-19'].map((d) => todaysFact(list, d)))
  expect(picks.size).toBeGreaterThan(1)
  expect(todaysFact([], '2025-11-15')).toBeNull()
})

test('streaks: longest run away, longest run of weeks with a new place, and the streak still running', () => {
  const s = streaks(data)
  expect(s.away).toEqual({ from: '2024-01-05', to: '2024-01-07', n: 3 })
  expect(s.newWeeks).toEqual({ from: '2024-01-01', to: '2024-01-21', n: 3 })
  // The record ends on two nights in Paris.
  expect(s.current).toBe(2)
})

test('streaks: a record that ends at home has no current streak', () => {
  const home = { ...data, visits: data.visits.slice(0, 4), meta: { range: [at(2024, 1, 1), at(2024, 1, 9, 12)] } } as Data
  expect(streaks(home).current).toBe(0)
  expect(streaks({ ...data, visits: [], daily: [] } as Data)).toEqual({ away: null, newWeeks: null, current: 0 })
})

test('compareYears: places, nights away, km and countries per calendar year, memoised per record', () => {
  expect(yearsWithData(data)).toEqual([2024, 2025])
  const [a, b] = compareYears(data, 2024, 2025)
  expect(a).toEqual({ year: 2024, places: 2, nightsAway: 3, km: 5500, countries: 1 })
  expect(b).toEqual({ year: 2025, places: 1, nightsAway: 2, km: 5504, countries: 1 })
  expect(compareYears(data, 2024, 2025)[0]).toBe(a)
  expect(compareYears(data, 2023, 2024)[0]).toEqual({ year: 2023, places: 0, nightsAway: 0, km: 0, countries: 0 })
})

test('cycleYear steps to the next year with data, skipping the one on the other chip', () => {
  expect(cycleYear([2022, 2023, 2024], 2022, 2024)).toBe(2023)
  expect(cycleYear([2022, 2023, 2024], 2023, 2024)).toBe(2022)
  expect(cycleYear([2023, 2024], 2023, 2024)).toBe(2023)
  expect(cycleYear([2024], 2024, 2024)).toBe(2024)
})

test('busiest names the hottest cell of the rhythm grid, or nothing on an empty one', () => {
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
  expect(busiest(grid)).toBeNull()
  grid[5][19] = 4; grid[1][18] = 3
  expect(busiest(grid)).toEqual({ d: 5, h: 19, v: 4 })
})
