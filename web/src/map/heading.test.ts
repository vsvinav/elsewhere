import { HeadingEase, iconAngle, POINT_KM, stampHeading } from './heading'
import type { Segment } from '../analytics/position'

const leg = (s: [number, number], e: [number, number], km: number, kind: Segment['kind'] = 'activity'): Segment =>
  ({ kind, start: 0, end: 1, s: { lng: s[0], lat: s[1] }, e: { lng: e[0], lat: e[1] }, mode: 'FLYING', km })

const SFO: [number, number] = [-122.375, 37.619], JFK: [number, number] = [-73.779, 40.64]
const LON: [number, number] = [-0.1278, 51.5074], SYD: [number, number] = [151.2093, -33.8688]

test('a dot at rest and the fast-forward chevrons never turn', () => {
  expect(stampHeading(leg(SFO, JFK, 4000), 'still')).toBeNull()
  expect(stampHeading(leg(SFO, JFK, 4000), 'ff')).toBeNull()
})

test('only an activity points somewhere; a visit or a gap stays upright', () => {
  expect(stampHeading(leg(SFO, JFK, 4000, 'visit'), 'fly')).toBeNull()
  expect(stampHeading(leg(SFO, JFK, 4000, 'gap'), 'fly')).toBeNull()
})

test('a short leg stays upright so the glyph reads; a long one points along the leg', () => {
  expect(POINT_KM).toBe(15)
  expect(stampHeading(leg([0, 0], [0.1, 0], 14.9), 'drive')).toBeNull()
  expect(stampHeading(leg([0, 0], [0.2, 0], 15), 'drive')).toBeCloseTo(90, 5)
})

test('a long leg takes the initial great-circle bearing from its start to its end', () => {
  expect(stampHeading(leg(SFO, JFK, 4150), 'fly')).toBeCloseTo(69.8, 1)
  expect(stampHeading(leg(LON, SYD, 17000), 'fly')).toBeCloseTo(60.7, 1)
  expect(stampHeading(leg([10, 20], [10, 0], 2200), 'transit')).toBeCloseTo(180, 5)
  expect(stampHeading(leg([10, 0], [10, 20], 2200), 'foot')).toBeCloseTo(0, 5)
})

test('a leg that ends where it started has no direction', () => {
  expect(stampHeading(leg(SFO, SFO, 100), 'fly')).toBeNull()
})

test('the shown angle eases to the target along the shortest arc', () => {
  const e = new HeadingEase()
  expect(e.at(350, 0)).toBe(350)
  const mid = e.at(10, 100)
  // 350 → 10 goes forward through 0, never back through 180.
  expect(mid > 350 || mid < 10).toBe(true)
  expect(mid).not.toBe(350)
  expect(e.at(10, 500)).toBeCloseTo(10, 6)
})

test('a mid-ease reading sits strictly between where it was and where it is going', () => {
  const e = new HeadingEase()
  e.at(0, 0)
  const mid = e.at(90, 175)
  expect(mid).toBeGreaterThan(0)
  expect(mid).toBeLessThan(90)
  expect(e.at(90, 600)).toBeCloseTo(90, 6)
})

test('losing the heading eases the glyph back upright', () => {
  const e = new HeadingEase()
  e.at(0, 0)
  e.at(120, 1000)
  const mid = e.at(null, 1100)
  expect(mid).toBeGreaterThan(0)
  expect(mid).toBeLessThan(120)
  expect(e.at(null, 1500)).toBeCloseTo(0, 6)
})

test('a stale ease snaps instead of sweeping from where it was long ago', () => {
  const e = new HeadingEase()
  e.at(0, 0)
  expect(e.at(270, 5000)).toBe(270)
})

test('deck.gl turns counter-clockwise, so an eastward heading is a negative angle', () => {
  expect(iconAngle(90)).toBe(-90)
  expect(iconAngle(0)).toBe(0)
})
