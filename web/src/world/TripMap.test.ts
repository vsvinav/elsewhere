import { describe, expect, it } from 'vitest'
import { routeAt, routeGeometry } from './TripMap'
import { onThisDayData, at } from '../test/onThisDay'

describe('route clipped to a playhead', () => {
  const data = onThisDayData()
  data.strokes = [{ start: at(2023, 11, 12, 10), end: at(2023, 11, 12, 11), pts: [0, 1, 2, 3, 4, 5, 6].map((i) => [at(2023, 11, 12, 10, i * 10), 35 + i / 100, 135.7] as [number, number, number]) }]
  const range: [number, number] = [at(2023, 11, 11, 8), at(2023, 11, 19, 2)]
  const g = routeGeometry(data, range)

  it('keeps the full box so the map does not jump while playing', () => {
    expect(g.flights).toHaveLength(2)
    expect(g.roads).toHaveLength(1)
    expect(g.box).not.toBeNull()
  })
  it('draws nothing before the first leg and everything at the end', () => {
    const before = routeAt(g, at(2023, 11, 11, 7))
    expect(before.flights).toHaveLength(0); expect(before.roads).toHaveLength(0)
    const end = routeAt(g, range[1])
    expect(end.flights.map((f) => f.length)).toEqual([2, 2])
    expect(end.roads[0]).toHaveLength(3)
  })
  it('interpolates a flight in progress and trims a road to the points driven so far', () => {
    const mid = routeAt(g, at(2023, 11, 11, 15))
    expect(mid.flights).toHaveLength(1)
    expect(mid.flights[0][1].lat).toBeCloseTo((42.36 + 35.01) / 2, 1)
    const road = routeAt(g, at(2023, 11, 12, 10, 30))
    expect(road.roads[0]).toHaveLength(2)
  })
  it('is the whole route when there is no playhead', () => {
    expect(routeAt(g, undefined)).toEqual({ roads: g.roads.map((r) => r.path), flights: g.flights.map((f) => f.path) })
  })
})
