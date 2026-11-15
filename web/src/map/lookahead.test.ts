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

test('a flight a few segments ahead is found by screen time, steady whatever the current segment is', () => {
  // From inside the first stay at 1x: ~1.5 s of stay left + 2.5 s walk + 2 s stay before the flight ≈ 6 s.
  expect(upcomingBig(data, 1 * H, 1, 8)?.seg.mode).toBe('FLYING')
  expect(upcomingBig(data, 1 * H, 1, 3)).toBeNull()
  expect(upcomingBig(data, 1 * H, 4, 3)?.seg.mode).toBe('FLYING')
  expect(upcomingBig(data, 10 * H + 1, 1, 60)).toBeNull()
  const a = upcomingBig(data, 9.5 * H, 1, 8)!, b = upcomingBig(data, 9.9 * H, 1, 8)!
  expect(a.inS).toBeGreaterThan(b.inS)
})
test('big legs keep screen time at any speed; small ones shrink', () => {
  const flight: Segment = { kind: 'activity', start: 0, end: 6 * H, s: A, e: B, mode: 'FLYING', km: 4300 }
  const hop: Segment = { kind: 'activity', start: 0, end: H, s: A, e: A, mode: 'DRIVING', km: 5 }
  expect(screenSeconds(flight, 32)).toBeGreaterThan(4)
  expect(screenSeconds(hop, 32)).toBeLessThan(0.2)
  expect(screenSeconds(flight, 1)).toBe(7)
})
