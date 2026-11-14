import { buildTrails } from './layers'
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
