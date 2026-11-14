import { inRange, kmByMode, distinctPlaces } from './range'
import type { Activity, Visit } from '../data/types'

const act = (start: number, end: number, mode: string, m: number): Activity =>
  ({ id: 0, start, end, tz: 0, s_lat: 0, s_lng: 0, e_lat: 0, e_lng: 0, m, mode, p: 1 })
const vis = (start: number, place_id: string): Visit =>
  ({ id: 0, start, end: start + 10, tz: 0, place_id, lat: 0, lng: 0, type: 'UNKNOWN', p: 1, lvl: 0 })

test('inRange keeps overlapping rows only', () => {
  const rows = [act(0, 10, 'WALKING', 1), act(20, 30, 'WALKING', 1), act(5, 25, 'WALKING', 1)]
  expect(inRange(rows, [12, 18]).length).toBe(1)
  expect(inRange(rows, [0, 30]).length).toBe(3)
  expect(inRange(rows, [100, 200])).toEqual([])
})

test('kmByMode sums metres into km per mode', () => {
  expect(kmByMode([act(0, 1, 'WALKING', 1500), act(0, 1, 'WALKING', 500), act(0, 1, 'FLYING', 10000)]))
    .toEqual({ WALKING: 2, FLYING: 10 })
  expect(kmByMode([])).toEqual({})
})

test('distinctPlaces counts unique place ids', () => {
  expect(distinctPlaces([vis(0, 'a'), vis(1, 'a'), vis(2, 'b')])).toBe(2)
})
