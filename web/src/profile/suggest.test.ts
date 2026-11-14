import { sleepPlaces, weekdayPlaces, moveMonths } from './suggest'
import type { Data } from '../data/types'

const D = 86400, H = 3600
const T0 = Date.UTC(2024, 10, 1) / 1000 // 2024-11-01
const place = (lat: number, city: string) => ({ lat, lng: 0, label: null, role: null, city, country_code: 'US', n_visits: 1, total_hours: 1, first_ts: 0, last_ts: 0, name: null })
const v = (id: number, start: number, end: number, place_id: string) => ({ id, start, end, tz: 0, place_id, p: 1, lvl: 0 })
const visits = [
  ...Array.from({ length: 40 }, (_, i) => v(i, T0 + i * D + 20 * H, T0 + (i + 1) * D + 7 * H, 'H1')),            // 40 nights Nov–Dec 2024
  ...Array.from({ length: 30 }, (_, i) => v(100 + i, T0 + (62 + i) * D + 20 * H, T0 + (63 + i) * D + 7 * H, 'H2')), // 30 nights from Jan 2 2025
  ...Array.from({ length: 20 }, (_, i) => v(200 + i, T0 + i * D + 10 * H, T0 + i * D + 16 * H, 'W1')).filter((x) => { const d = new Date(x.start * 1000).getUTCDay(); return d > 0 && d < 6 }),
]
const fx = { visits, places: { H1: place(1, 'Boston'), H2: place(2, 'Sunnyvale'), W1: place(3, 'Boston') } } as unknown as Data

test('sleepPlaces ranks by nights', () => {
  const s = sleepPlaces(fx)
  expect(s.map((x) => x.place_id)).toEqual(['H1', 'H2'])
  expect(s[0].score).toBe(40)
})
test('weekdayPlaces excludes sleep places', () => {
  expect(weekdayPlaces(fx).map((x) => x.place_id)).toEqual(['W1'])
})
test('moveMonths finds the month the modal sleep place changes', () => {
  expect(moveMonths(fx)).toEqual([{ month: '2025-01', from: 'H1', to: 'H2' }])
})
test('sleepPlaces keeps folded members and a share of nights', () => {
  const twin = { ...fx, visits: [...fx.visits, ...Array.from({ length: 5 }, (_, i) => v(300 + i, T0 + (45 + i) * D + 20 * H, T0 + (46 + i) * D + 7 * H, 'H1b'))], places: { ...fx.places, H1b: { ...place(1, 'Boston'), lat: 1.0001 } } } as unknown as Data
  const s = sleepPlaces(twin)[0]
  expect(s.members.sort()).toEqual(['H1', 'H1b'])
  expect(s.score).toBe(45)
  expect(s.share).toBe(1)
  expect(sleepPlaces(fx)[1].share).toBe(1)
})
