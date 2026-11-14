import { buildTrails } from './layers'
import type { Data } from '../../data/types'

test('buildTrails offsets timestamps and maps lat/lng to lng/lat', () => {
  const data = {
    paths: [{ start: 100, end: 200, pts: [[100, 1, 2], [200, 3, 4]] }, { start: 0, end: 0, pts: [[0, 0, 0]] }],
    activities: [{ id: 0, start: 300, end: 400, tz: 0, s_lat: 5, s_lng: 6, e_lat: 7, e_lng: 8, m: 1, mode: 'FLYING', p: 1 }],
  } as unknown as Data
  const t = buildTrails(data, 100)
  expect(t.length).toBe(2)
  expect(t[0].path).toEqual([[2, 1], [4, 3]])
  expect(t[0].ts).toEqual([0, 100])
  expect(t[1].ts).toEqual([200, 300])
})
