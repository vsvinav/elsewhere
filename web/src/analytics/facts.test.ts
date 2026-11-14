import { bedStrip, longestRun } from './beds'
import { facts } from './facts'
import type { Data } from '../data/types'

const H = 3600, D = 86400
const JAN = Date.UTC(2025, 0, 1) / 1000
const v = (start: number, end: number, place_id: string, lat: number, lng: number) => ({ start, end, place_id, type: 'UNKNOWN', lvl: 0, lng, lat, tz: 0, id: 0, p: 1 })
const place = (role: 'home' | null, city: string, country_code: string, lat: number, lng: number, extra = {}) =>
  ({ lng, lat, role, city, country_code, n_visits: 1, first_ts: JAN, last_ts: JAN, name: null, total_hours: 1, ...extra })

// Four nights home, two in Paris (new), one home, two in Paris again (repeat); Jan 10 unaccounted for.
const data = {
  visits: [
    v(JAN, JAN + 4 * D - 12 * H, 'home', 42.36, -71.06),
    v(JAN + 4 * D, JAN + 6 * D - 12 * H, 'hotel', 48.85, 2.35),
    v(JAN + 6 * D, JAN + 7 * D - 12 * H, 'home', 42.36, -71.06),
    v(JAN + 7 * D, JAN + 9 * D - 12 * H, 'hotel2', 48.86, 2.34),
  ],
  activities: [
    { start: JAN + 4 * D - 10 * H, end: JAN + 4 * D - 2 * H, mode: 'FLYING', m: 5_500_000, s_lat: 42.36, s_lng: -71.06, e_lat: 48.85, e_lng: 2.35, tz: 0, id: 0, p: 1 },
    { start: JAN + 6 * D - 10 * H, end: JAN + 6 * D - 2 * H, mode: 'FLYING', m: 5_500_000, s_lat: 48.85, s_lng: 2.35, e_lat: 42.36, e_lng: -71.06, tz: 0, id: 0, p: 1 },
    { start: JAN + 2 * H, end: JAN + 3 * H, mode: 'WALKING', m: 40_000, s_lat: 42.36, s_lng: -71.06, e_lat: 42.4, e_lng: -71.1, tz: 0, id: 0, p: 1 },
  ],
  paths: [], strokes: [],
  places: {
    home: place('home', 'Boston', 'US', 42.36, -71.06),
    hotel: place(null, 'Paris', 'FR', 48.85, 2.35),
    hotel2: place(null, 'Paris', 'FR', 48.86, 2.34),
  },
  daily: [], trips: [],
  profile: { home: { lat: 42.36, lng: -71.06 } },
  meta: { range: [JAN, JAN + 10 * D] },
} as unknown as Data

test('bedStrip: one night per local date, new vs repeat judged by city, gaps are none', () => {
  const n = bedStrip(data)
  expect(n.map((x) => x.kind).join(' ')).toBe('home home home home new new home repeat repeat none none')
  expect(n[4].city).toBe('Paris')
})

test('bedStrip: a cut range keeps firsts judged over the whole record', () => {
  const n = bedStrip(data, [JAN + 7 * D, JAN + 8 * D])
  expect(n.map((x) => x.kind)).toEqual(['repeat', 'repeat'])
})

test('longestRun finds the longest matching streak with its dates', () => {
  const n = bedStrip(data)
  expect(longestRun(n, (x) => x.kind === 'home')).toEqual({ from: '2025-01-01', to: '2025-01-04', n: 4 })
  expect(longestRun(n, (x) => x.kind === 'new' || x.kind === 'repeat')).toEqual({ from: '2025-01-05', to: '2025-01-06', n: 2 })
  expect(longestRun(n, () => false)).toBeNull()
})

test('facts: fires on a small record, converts to miles, and stays silent on an empty one', () => {
  const km = facts(data, 'km')
  const ids = km.map((f) => f.id)
  expect(ids).toContain('countries')
  expect(ids).toContain('furthest')
  expect(ids).toContain('walked')
  expect(km.find((f) => f.id === 'countries')!.headline).toBe('2 of 195 countries')
  // Sorted explored → record → scale → habit.
  const order = ['explored', 'record', 'scale', 'habit']
  expect(km.every((f, i) => i === 0 || order.indexOf(f.kind) >= order.indexOf(km[i - 1].kind))).toBe(true)

  const mi = facts(data, 'mi')
  expect(mi.find((f) => f.id === 'walked')!.detail).toMatch(/25 mi on foot/)
  const fig = mi.find((f) => f.id === 'walked')!.figure
  expect(fig && fig.t === 'scale' && fig.unit).toBe('mi')

  expect(facts({ ...data, visits: [], activities: [], places: {} } as Data, 'km')).toEqual([])
})
