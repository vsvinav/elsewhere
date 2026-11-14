import { frameFor } from './frame'
import type { Segment } from '../analytics/position'

const A = { lng: -71, lat: 42 }, B = { lng: -122, lat: 37 }
const flight: Segment = { kind: 'activity', start: 1000, end: 1000 + 6 * 3600, s: A, e: B, mode: 'FLYING', km: 4300 }
const longStay: Segment = { kind: 'visit', start: 0, end: 36000, s: A, e: A, mode: 'STILL', km: 0 }
const blip: Segment = { kind: 'visit', start: 0, end: 600, s: A, e: A, mode: 'STILL', km: 0 }

test('a leg is framed whole, with the centre drifting toward the dot', () => {
  const start = frameFor(flight, null, A, 1000, 3600, 1200, 800)
  const late = frameFor(flight, null, B, 1000 + 5.9 * 3600, 3600, 1200, 800)
  expect(start.zoom).toBeLessThan(6)
  expect(start.zoom).toBe(late.zoom)
  expect(Math.abs(start.center.lng - (-96.5))).toBeLessThan(10)
  expect(Math.abs(late.center.lng - B.lng)).toBeLessThan(3)
})
test('a long stay zooms to town, except its last beat before a flight', () => {
  expect(frameFor(longStay, flight, A, 1000, 60, 1200, 800).zoom).toBe(14)
  expect(frameFor(longStay, flight, A, 35990, 60, 1200, 800).zoom).toBeLessThan(8)
})
test('a short stop between legs keeps the wide frame', () => {
  expect(frameFor(blip, flight, A, 300, 600, 1200, 800).zoom).toBeLessThan(8)
})
