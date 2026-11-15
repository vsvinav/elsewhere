import { upcomingBig } from './lookahead'
import { screenSeconds } from './pace'
import type { Data } from '../data/types'
import type { Segment } from '../analytics/position'

const H = 3600
const A = { lat: 42, lng: -71 }, B = { lat: 37, lng: -122 }
const visit = (start: number, end: number, p = A) => ({ place_id: 'p', start, end, lvl: 0, lat: p.lat, lng: p.lng, tz: 0 })
const act = (start: number, end: number, s: typeof A, e: typeof A, m: number, mode = 'DRIVING') => ({ start, end, s_lat: s.lat, s_lng: s.lng, e_lat: e.lat, e_lng: e.lng, m, mode, tz: 0 })
const data = {
  visits: [visit(0, 2 * H), visit(3 * H, 10 * H), visit(16 * H, 20 * H, B)],
  activities: [act(2 * H, 3 * H, A, A, 5_000), act(10 * H, 16 * H, A, B, 4_300_000, 'FLYING')],
  paths: [], places: {}, meta: { range: [0, 20 * H] },
} as unknown as Data

test('a flight a few segments ahead is found inside the horizon and not beyond it', () => {
  expect(upcomingBig(data, 1 * H, 12 * H)?.mode).toBe('FLYING')
  expect(upcomingBig(data, 1 * H, 9 * H)).toBeNull()
  expect(upcomingBig(data, 10 * H + 1, 20 * H)).toBeNull()
})
test('big legs keep screen time at any speed; small ones shrink', () => {
  const flight: Segment = { kind: 'activity', start: 0, end: 6 * H, s: A, e: B, mode: 'FLYING', km: 4300 }
  const hop: Segment = { kind: 'activity', start: 0, end: H, s: A, e: A, mode: 'DRIVING', km: 5 }
  expect(screenSeconds(flight, 32)).toBeGreaterThan(4)
  expect(screenSeconds(hop, 32)).toBeLessThan(0.2)
  expect(screenSeconds(flight, 1)).toBe(7)
})
