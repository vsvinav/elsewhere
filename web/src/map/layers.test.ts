import { buildTrails, pinLayers, wakeLength } from './layers'
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

test('the wake is sixteen seconds of screen time, clamped between three hours and a month', () => {
  expect(wakeLength(3600)).toBe(16 * 3600)
  expect(wakeLength(60)).toBe(3 * 3600)
  expect(wakeLength(10 * 86400)).toBe(30 * 86400)
})

const pinData = () => {
  const place = (lng: number, lat: number, n_visits: number, role: 'home' | null = null) => ({ lat, lng, label: null, role, city: null, country_code: null, n_visits, total_hours: 1, first_ts: 0, last_ts: 0, name: 'x' })
  return {
    activities: [], paths: [], meta: { range: [0, 1] },
    places: { a: place(0, 0, 3), b: place(10, 10, 9), h: place(5, 5, 1, 'home') },
  } as unknown as Data
}

test('the Map tab draws pins, clusters and homes by default', () => {
  const ids = pinLayers(pinData(), 10, { hidden: [], selected: null, sizeBy: 'visits', heat: false }).map((l) => l.id)
  expect(ids).toEqual(expect.arrayContaining(['groups', 'group-counts', 'pin-back', 'places', 'home-back', 'homes', 'labels']))
  expect(ids).not.toContain('heat')
})

test('heat swaps pins and clusters for one heatmap layer and leaves homes alone', () => {
  const layers = pinLayers(pinData(), 10, { hidden: [], selected: 'a', sizeBy: 'visits', heat: true })
  const ids = layers.map((l) => l.id)
  expect(ids).toContain('heat')
  expect(ids).toContain('homes')
  expect(ids).toContain('pin-top')
  for (const gone of ['groups', 'group-counts', 'pin-back', 'places']) expect(ids).not.toContain(gone)
  expect(ids.indexOf('heat')).toBeLessThan(ids.indexOf('homes'))
  expect(ids.indexOf('heat')).toBeLessThan(ids.indexOf('labels'))
  const heat = layers.find((l) => l.id === 'heat')!.props as unknown as { data: { id: string }[]; radiusPixels: number; colorRange: unknown[]; aggregation: string }
  expect(heat.data.map((d) => d.id).sort()).toEqual(['a', 'b'])
  expect(heat.radiusPixels).toBe(40)
  expect(heat.colorRange).toHaveLength(6)
  expect(heat.aggregation).toBe('SUM')
})

test('hiding a kind of stop removes its heat too', () => {
  const layers = pinLayers(pinData(), 10, { hidden: ['other'], selected: null, sizeBy: 'visits', heat: true })
  const heat = layers.find((l) => l.id === 'heat')!.props as unknown as { data: unknown[] }
  expect(heat.data).toHaveLength(0)
})
