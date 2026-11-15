import { HEAT_STOPS, heatColor, heatCss, heatWeight } from './heat'
import type { Place } from '../data/types'

const place = (n_visits: number): Place => ({ lat: 0, lng: 0, label: null, role: null, city: null, country_code: null, n_visits, total_hours: 0, first_ts: 0, last_ts: 0, name: null })

test('the palette runs cold to hot: transparent blue, green at 0.4, red at the top', () => {
  expect(heatColor(0)).toEqual([43, 75, 209, 0])
  expect(heatColor(0.4)).toEqual([47, 191, 113, 200])
  expect(heatColor(1)).toEqual([214, 60, 32, 255])
})

test('out-of-range values clamp to the ends', () => {
  expect(heatColor(1.7)).toEqual(heatColor(1))
  expect(heatColor(-3)).toEqual(heatColor(0))
})

test('between stops the colour is interpolated, not snapped', () => {
  const [r, g, b, a] = heatColor(0.5)
  const green = HEAT_STOPS[2], yellow = HEAT_STOPS[3]
  expect(r).toBeGreaterThan(green[0]); expect(r).toBeLessThan(yellow[0])
  expect(g).toBeGreaterThan(green[1]); expect(g).toBeLessThan(yellow[1])
  expect(b).toBeGreaterThan(yellow[2]); expect(b).toBeLessThan(green[2])
  expect(a).toBeGreaterThan(green[3]); expect(a).toBeLessThan(yellow[3])
})

test('the legend gradient lists every stop in order', () => {
  const css = heatCss()
  expect(css.startsWith('linear-gradient(90deg')).toBe(true)
  expect(css.match(/rgba\(/g)).toHaveLength(6)
  expect(css).toContain('rgba(43, 75, 209, 0) 0%')
  expect(css).toContain('rgba(214, 60, 32, 1) 100%')
})

test('heat weighs a stop by how often you went', () => {
  expect(heatWeight(place(7))).toBe(7)
  expect(heatWeight(place(1))).toBe(1)
})

test('weighing and filtering a hundred thousand stops is well under a frame', () => {
  const dots = Array.from({ length: 100_000 }, (_, i) => ({ ...place((i % 40) + 1), cat: i % 7 }))
  const hidden = new Set([3, 5])
  const t0 = performance.now()
  const shown = dots.filter((d) => !hidden.has(d.cat))
  let sum = 0
  for (const d of shown) sum += heatWeight(d)
  const ms = performance.now() - t0
  expect(sum).toBeGreaterThan(0)
  expect(shown.length).toBeLessThan(dots.length)
  expect(ms).toBeLessThan(50)
})
