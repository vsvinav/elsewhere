import { describe, expect, it } from 'vitest'
import { cellCentre, geohash } from './geohash'

describe('geohash', () => {
  it('encodes the textbook cells', () => {
    expect(geohash(42.6, -5.6, 5)).toBe('ezs42')
    expect(geohash(57.64911, 10.40744, 11)).toBe('u4pruydqqvj')
    expect(geohash(38.7223, -9.1393, 7)).toMatch(/^eycs[0-9b-hjkmnp-z]{3}$/)
  })
  it('cell centre is within the cell and stable under re-encoding', () => {
    const c = cellCentre(38.7223, -9.1393, 7)
    expect(geohash(c.lat, c.lng, 7)).toBe(geohash(38.7223, -9.1393, 7))
    expect(Math.abs(c.lat - 38.7223)).toBeLessThan(0.001)
  })
})
