import { describe, expect, it } from 'vitest'
import { dialAngle, dialGeometry } from './dial'

const counts = (fill: Partial<Record<number, number>>) => Array.from({ length: 24 }, (_, h) => fill[h] ?? 0)

describe('dialAngle', () => {
  it('reads like a wall clock: 12 up, 3 right, 6 down, 9 left', () => {
    expect(dialAngle(12)).toBe(-90)
    expect(dialAngle(0)).toBe(-90)
    expect(dialAngle(3)).toBe(0)
    expect(dialAngle(6)).toBe(90)
    expect(dialAngle(9)).toBe(180)
  })
  it('folds the afternoon onto the same face', () => {
    expect(dialAngle(18.5)).toBeCloseTo(dialAngle(6.5))
    expect(dialAngle(15)).toBe(0)
  })
})

describe('dialGeometry', () => {
  it('lays out twelve ticks, the big ones at the quarters, and labels 12 · 3 · 6 · 9', () => {
    const g = dialGeometry(counts({}), 7)
    expect(g.ticks).toHaveLength(12)
    expect(g.ticks.filter((t) => t.big).map((t) => t.angle)).toEqual([-90, 0, 90, 180])
    expect(g.labels.map((l) => l.text)).toEqual(['12', '3', '6', '9'])
    expect(g.labels.map((l) => l.angle)).toEqual([-90, 0, 90, 180])
  })
  it('points the hand at the hour mod 12 and tags the meridiem', () => {
    expect(dialGeometry(counts({}), 18.5).hand).toEqual({ angle: dialAngle(6.5), meridiem: 'PM' })
    expect(dialGeometry(counts({}), 6.5).hand).toEqual({ angle: dialAngle(6.5), meridiem: 'AM' })
    expect(dialGeometry(counts({}), 12).hand).toEqual({ angle: -90, meridiem: 'PM' })
    expect(dialGeometry(counts({}), 24.5).hand.meridiem).toBe('AM')
  })
  it('splits the hourly bars into an AM inner ring and a PM outer ring, scaled to the busiest hour', () => {
    const g = dialGeometry(counts({ 7: 5, 12: 10, 19: 2 }), 12)
    expect(g.bars).toEqual([
      { hour: 7, ring: 'am', angle: dialAngle(7.5), len: 0.5 },
      { hour: 12, ring: 'pm', angle: dialAngle(0.5), len: 1 },
      { hour: 19, ring: 'pm', angle: dialAngle(7.5), len: 0.2 },
    ])
  })
  it('skips empty hours and survives an empty distribution', () => {
    expect(dialGeometry(counts({}), 3).bars).toEqual([])
  })
  it('wraps a night window past midnight as one short arc through 12', () => {
    const g = dialGeometry(counts({}), 1, [23, 7])
    expect(g.arc).toEqual({ from: dialAngle(11), sweep: 240, full: false })
    expect(dialGeometry(counts({}), 1, [22, 28]).arc).toEqual({ from: dialAngle(10), sweep: 180, full: false })
  })
  it('clamps a window longer than half a day to the whole face', () => {
    expect(dialGeometry(counts({}), 1, [20, 34]).arc).toEqual({ from: dialAngle(8), sweep: 360, full: true })
    expect(dialGeometry(counts({}), 1, [0, 12]).arc).toEqual({ from: -90, sweep: 360, full: true })
  })
  it('has no arc when no window is given', () => {
    expect(dialGeometry(counts({}), 1).arc).toBeUndefined()
  })
})
