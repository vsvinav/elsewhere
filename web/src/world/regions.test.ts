import { describe, expect, it } from 'vitest'
import { regions } from './regions'
import type { Hop, Port } from './flights'

const port = (lng: number, lat: number, name: string, n = 1): Port => ({ p: [lng, lat], name, n })
describe('regions', () => {
  it('chains airports into one neighbourhood regardless of input order and keeps only clusters with internal routes', () => {
    const ports = [port(-71, 42.4, 'Boston', 9), port(-122, 37.6, 'San Francisco', 5), port(-105, 39.9, 'Denver', 3), port(-88, 42, 'Chicago', 2), port(-158, 21.3, 'Honolulu'), port(11.8, 48.4, 'Munich')]
    const hops: Hop[] = [{ s: [-71, 42.4], t: [-122, 37.6], km: 4300, n: 4 }, { s: [-105, 39.9], t: [-71, 42.4], km: 2800, n: 1 }, { s: [-71, 42.4], t: [11.8, 48.4], km: 6000, n: 1 }]
    const r = regions(hops, ports)
    expect(r).toHaveLength(1)
    expect(r[0].name).toBe('Boston')
    expect(r[0].ports.map((p) => p.name)).toEqual(['Boston', 'San Francisco', 'Denver', 'Chicago'])
    expect(r[0].hops).toHaveLength(2)
  })
})
