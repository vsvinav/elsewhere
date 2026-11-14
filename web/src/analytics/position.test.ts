import { positionAt, distanceKm, whereaboutsAt } from './position'
import type { Data } from '../data/types'

const data = {
  visits: [
    { start: 0, end: 10, lvl: 0, lng: 1, lat: 1 },
    { start: 2, end: 4, lvl: 1, lng: 9, lat: 9 },
    { start: 30, end: 40, lvl: 0, lng: 3, lat: 3 },
  ],
  activities: [{ start: 10, end: 30, s_lng: 1, s_lat: 1, e_lng: 3, e_lat: 3 }],
} as unknown as Data

test('inside a top-level visit returns the place, ignoring nested visits', () => {
  expect(positionAt(data, 3)).toEqual({ lng: 1, lat: 1 })
})
test('inside an activity interpolates', () => {
  expect(positionAt(data, 20)).toEqual({ lng: 2, lat: 2 })
})
test('gap falls back to last visit; before everything is null', () => {
  expect(positionAt(data, 50)).toEqual({ lng: 3, lat: 3 })
  expect(positionAt({ visits: [], activities: [] } as unknown as Data, 5)).toBeNull()
})
test('distanceKm Boston to SF', () => {
  const d = distanceKm({ lng: -71.0589, lat: 42.3601 }, { lng: -122.4194, lat: 37.7749 })
  expect(d).toBeGreaterThan(4330); expect(d).toBeLessThan(4350)
})

test('whereaboutsAt reports movement mode', () => {
  const d = { visits: [{ start: 0, end: 10, lvl: 0, lng: 1, lat: 1 }],
    activities: [{ start: 10, end: 30, s_lng: 1, s_lat: 1, e_lng: 3, e_lat: 3, mode: 'FLYING' }] } as unknown as Data
  expect(whereaboutsAt(d, 5)?.mode).toBe('STILL')
  expect(whereaboutsAt(d, 20)?.mode).toBe('FLYING')
})
