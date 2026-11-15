import { vi } from 'vitest'
import type { IconLayer } from 'deck.gl'
import { buildTrails, mapLayers, wakeLength } from './layers'
import type { Data } from '../data/types'

test('a leg with a GPS trace is drawn once; an untraced flight gets a synthetic arc', () => {
  const d = {
    activities: [
      { start: 0, end: 100, s_lng: 0, s_lat: 0, e_lng: 1, e_lat: 1, m: 1000, mode: 'IN_PASSENGER_VEHICLE' },
      { start: 200, end: 300, s_lng: 0, s_lat: 0, e_lng: 10, e_lat: 10, m: 1_500_000, mode: 'FLYING' },
    ],
    paths: [{ start: 0, end: 100, pts: [[0, 0, 0], [100, 1, 1]] }],
    meta: { range: [0, 300] },
  } as unknown as Data
  const t = buildTrails(d, 0)
  expect(t.map((x) => x.lens)).toEqual(['drive', 'fly'])
})

test('the wake is sixteen seconds of screen time, clamped between three hours and a month', () => {
  expect(wakeLength(3600)).toBe(16 * 3600)
  expect(wakeLength(60)).toBe(3 * 3600)
  expect(wakeLength(10 * 86400)).toBe(30 * 86400)
})

test('the stamp turns along a long flight and stays upright on a short drive', () => {
  const d = {
    visits: [],
    activities: [
      { start: 0, end: 1000, s_lng: -122.375, s_lat: 37.619, e_lng: -73.779, e_lat: 40.64, m: 4_150_000, mode: 'FLYING' },
      { start: 2000, end: 3000, s_lng: 0, s_lat: 0, e_lng: 0.05, e_lat: 0, m: 5_000, mode: 'IN_PASSENGER_VEHICLE' },
    ],
    paths: [], places: {}, daily: [], trips: [], profile: {},
    meta: { range: [0, 3000] },
  } as unknown as Data
  const now = vi.spyOn(performance, 'now')
  const angleAt = (t: number, clock: number) => {
    now.mockReturnValue(clock)
    const here = mapLayers(d, t, 1, true).find((l) => l.id === 'here') as IconLayer
    return (here.props.getAngle as () => number)()
  }
  // The stamp kind only changes once it has held for a beat, so the first frame still shows the resting dot.
  angleAt(500, 0)
  expect(angleAt(500, 1000)).toBeCloseTo(-69.8, 1)
  angleAt(2500, 3000)
  expect(angleAt(2500, 4000)).toBe(0)
  now.mockRestore()
})
