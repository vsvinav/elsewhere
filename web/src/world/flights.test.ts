import { describe, expect, it } from 'vitest'
import { flights } from './flights'
import type { Data } from '../data/types'

const act = (s: [number, number], e: [number, number], mode = 'FLYING', m = 4_000_000) => ({ start: 0, end: 1, mode, m, s_lng: s[0], s_lat: s[1], e_lng: e[0], e_lat: e[1] })
const data = {
  activities: [act([-71, 42.3], [-122, 37.6]), act([-122, 37.6], [-71, 42.3]), act([-71, 42.3], [70, 20]), act([-71, 42.3], [-71.2, 42.4], 'FLYING', 20_000), act([-71, 42.3], [-122, 37.6], 'IN_PASSENGER_VEHICLE')],
  visits: [{ lvl: 0, lng: -71.05, lat: 42.36, place_id: 'p' }],
  places: { p: { city: 'Boston' } },
} as unknown as Data

describe('flights', () => {
  it('merges return legs into one route, drops hops and ground legs, names ports by hub airport, else nearest visited city', () => {
    const { hops, ports } = flights(data)
    expect(hops).toHaveLength(2)
    expect(hops[0].n).toBe(2)
    expect(hops[1].km).toBeGreaterThan(12_000)
    expect(ports.map((p) => p.name)).toEqual(['Boston', 'San Francisco', ''])
  })
})
