import { describe, expect, it } from 'vitest'
import { HOLD, LEG, POINTS, TOTAL, WOBBLE, pathD, sketchAt } from './route'

describe('sketchAt', () => {
  it('holds at home before the first leg', () => {
    expect(sketchAt(0)).toEqual({ leg: 0, progress: 0, km: 0, stamps: 0 })
    expect(sketchAt(HOLD - 1)).toMatchObject({ leg: 0, progress: 0, km: 0, stamps: 0 })
  })
  it('counts kilometres up through the first leg without landing a stamp', () => {
    const s = sketchAt(1000)
    expect(s.leg).toBe(1)
    expect(s.km).toBeGreaterThan(0)
    expect(s.km).toBeLessThan(420)
    expect(s.stamps).toBe(0)
    expect(s.progress).toBeGreaterThan(0)
    expect(s.progress).toBeLessThan(0.2)
  })
  it('lands the first stamp exactly when the leg ends', () => {
    expect(sketchAt(HOLD + LEG)).toMatchObject({ km: 420, stamps: 1, progress: 0.2 })
  })
  it('rests on the full route after the last leg', () => {
    expect(sketchAt(TOTAL)).toMatchObject({ km: 14920, stamps: 5, progress: 1 })
    expect(sketchAt(TOTAL + 5000)).toMatchObject({ km: 14920, stamps: 5, progress: 1 })
    expect(TOTAL).toBe(HOLD + LEG * (POINTS.length - 1))
  })
  it('draws every pin and wobble point on the 400×300 sheet', () => {
    const d = pathD()
    expect(d.startsWith('M48 234')).toBe(true)
    expect(d.split(' L').length).toBe(POINTS.length + WOBBLE.flat().length)
    expect(d.endsWith('L360 174')).toBe(true)
  })
})
