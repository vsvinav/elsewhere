import { bedStrip, longestRun } from './beds'
import { facts } from './facts'
import { filterData } from '../data/filter'
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
  expect(ids).toContain('hermit')
  expect(ids).toContain('furthest')
  expect(ids).toContain('walked')
  expect(km.find((f) => f.id === 'hermit')!.headline).toBe('84 hours without leaving the house')
  // Sorted explored → record → scale → habit.
  const order = ['explored', 'record', 'scale', 'habit']
  expect(km.every((f, i) => i === 0 || order.indexOf(f.kind) >= order.indexOf(km[i - 1].kind))).toBe(true)

  const mi = facts(data, 'mi')
  expect(mi.find((f) => f.id === 'walked')!.detail).toMatch(/25 mi on foot/)
  const fig = mi.find((f) => f.id === 'walked')!.figure
  expect(fig && fig.t === 'scale' && fig.unit).toBe('mi')

  expect(facts({ ...data, visits: [], activities: [], places: {} } as Data, 'km')).toEqual([])
})

test('facts: the fastest leg names its mode, or says road when the mode is not one we name', () => {
  const leg = (mode: string) => ({ start: JAN + 12 * H, end: JAN + 13 * H, mode, m: 100_000, s_lat: 42.36, s_lng: -71.06, e_lat: 43.0, e_lng: -71.06, tz: 0, id: 0, p: 1 })
  const fastest = (mode: string) => facts({ ...data, activities: [...data.activities, leg(mode)] }).find((f) => f.id === 'fastest')!.detail
  expect(fastest('IN_TRAIN')).toContain('by train.')
  expect(fastest('IN_VEHICLE')).toContain('by road.')
  expect(fastest('IN_VEHICLE')).not.toContain('other')
})

test('facts: a cut range only counts what happened inside it, but keeps firsts from the whole record', () => {
  const cut = filterData(data, [JAN + 7 * D, JAN + 10 * D])
  const f = facts(cut, 'km', data)
  expect(f.map((x) => x.id)).not.toContain('walked')
  expect(f.map((x) => x.id)).not.toContain('hermit')
  expect(f.find((x) => x.id === 'furthest')?.detail).toMatch(/January 8, 2025/)
})

test('facts: each one carries a door to the window or the pins that made it', () => {
  const f = facts(data, 'km')
  const door = (id: string) => f.find((x) => x.id === id)!.door
  // Whole-record scale facts open the whole range.
  expect(door('laps')).toMatchObject({ kind: 'range', from: JAN, to: JAN + 10 * D })
  expect(door('walked')).toMatchObject({ kind: 'range', from: JAN, to: JAN + 10 * D })
  // The hermit stretch is the stay itself.
  expect(door('hermit')).toMatchObject({ kind: 'range', from: JAN, to: JAN + 4 * D - 12 * H })
  // Furthest and longest stay open the pin, with the playhead on the visit.
  expect(door('furthest')).toMatchObject({ kind: 'place', placeId: expect.stringMatching(/^hotel/), at: expect.any(Number) })
  expect(door('longest-stay')).toMatchObject({ kind: 'place', placeId: 'hotel', at: JAN + 4 * D })
  // Countries: one pin per country.
  const c = door('countries')
  expect(c?.kind).toBe('places')
  expect(c && c.kind === 'places' && c.placeIds.length).toBe(2)
  expect(c && c.kind === 'places' && c.placeIds).toContain('home')
  // Every fact's door reads as its headline.
  for (const x of f) expect(x.door?.label).toBe(x.headline)
})

test('facts: a record of 100k visits, doors included, comes back in one pass', () => {
  const N = 100_000, P = 4_000
  const places: Record<string, ReturnType<typeof place>> = { home: place('home', 'Boston', 'US', 42.36, -71.06) }
  for (let i = 0; i < P; i++) places[`p${i}`] = place(null, `City${i % 400}`, `C${i % 150}`, 40 + (i % 90) / 10, -70 + (i % 300) / 10, { primary_type: ['cafe', 'bar', 'gym', 'airport', 'supermarket', 'restaurant', 'train_station', 'clothing_store'][i % 8], name: `P${i}`, n_visits: 1 + (i % 9), total_hours: 2 + (i % 5) })
  const visits = []
  for (let i = 0; i < N; i++) {
    const t = JAN + i * 1800
    const id = i % 3 === 0 ? 'home' : `p${i % P}`
    visits.push(v(t, t + 1500, id, places[id].lat, places[id].lng))
  }
  const big = { ...data, visits, places, meta: { range: [JAN, JAN + N * 1800] } } as unknown as Data
  const t0 = performance.now()
  const f = facts(big, 'km')
  const ms = performance.now() - t0
  expect(f.length).toBeGreaterThan(5)
  for (const x of f) expect(x.door).toBeDefined()
  expect(ms).toBeLessThan(3000)
})
