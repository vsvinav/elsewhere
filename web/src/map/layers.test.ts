import { vi } from 'vitest'
import type { IconLayer } from 'deck.gl'
import { buildTrails, mapLayers, pinLayers, tripArcs, wakeLength } from './layers'
import type { Data } from '../data/types'
import { sampleData } from '../test/sample'

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

test('the stamp turns along a long flight and stays upright on a short drive', () => {
  const d = {
    visits: [],
    activities: [
      { start: 0, end: 1000, s_lng: -122.375, s_lat: 37.619, e_lng: -73.779, e_lat: 40.64, m: 4_150_000, mode: 'FLYING' },
      { start: 2000, end: 3000, s_lng: 0, s_lat: 0, e_lng: 0.05, e_lat: 0, m: 5_000, mode: 'IN_PASSENGER_VEHICLE' },
    ],
    paths: [], places: {}, daily: [], trips: [], profile: {},
    meta: { range: [0, 3000] },
  } as unknown as Data
  const now = vi.spyOn(performance, 'now')
  const angleAt = (t: number, clock: number) => {
    now.mockReturnValue(clock)
    const here = mapLayers(d, t, 1, true).find((l) => l.id === 'here') as IconLayer
    return (here.props.getAngle as () => number)()
  }
  // The stamp kind only changes once it has held for a beat, so the first frame still shows the resting dot.
  angleAt(500, 0)
  expect(angleAt(500, 1000)).toBeCloseTo(-69.8, 1)
  angleAt(2500, 3000)
  expect(angleAt(2500, 4000)).toBe(0)
  now.mockRestore()
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

describe('grain', () => {
  const data = sampleData()
  const now = data.trips[1].end + 3600
  it('year draws trip arcs, no trail and no live head', () => {
    const ids = mapLayers(data, now, 1, false, now, 4, 'all', 'year').map((l) => l.id)
    expect(ids).toEqual(['trip-arcs'])
  })
  it('month draws places and the hairline record, even while playing, but no head or stamp', () => {
    const ids = mapLayers(data, now, 1, true, now, 4, 'all', 'month').map((l) => l.id)
    expect(ids).toContain('play-places'); expect(ids).toContain('labels'); expect(ids).toContain('record')
    expect(ids).not.toContain('trail-head'); expect(ids).not.toContain('trail-long'); expect(ids).not.toContain('here-ring'); expect(ids).not.toContain('trip-arcs')
  })
  it('day is the replay as before', () => {
    const ids = mapLayers(data, now, 1, true, now, 4, 'all', 'day').map((l) => l.id)
    expect(ids).toContain('trail-head'); expect(ids).toContain('trail-long'); expect(ids).toContain('play-places')
    expect(ids).not.toContain('trip-arcs')
    expect(mapLayers(data, now, 1, true, now, 4, 'all').map((l) => l.id)).toEqual(ids)
  })
})

describe('tripArcs', () => {
  const data = sampleData()
  it('chains home → anchor cities → home for every trip begun by the playhead', () => {
    const all = tripArcs(data)
    // Two one-city trips: out and back each.
    expect(all).toHaveLength(4)
    expect(all[0].path[0]).toEqual(all[1].path[all[1].path.length - 1])
    expect(all[0].path.length).toBeGreaterThan(2)
    expect(all[0].km).toBeGreaterThan(4000)
    expect(all[0].ts[0]).toBe(data.trips[0].start); expect(all[1].ts[1]).toBe(data.trips[0].end)
    expect(tripArcs(data, data.trips[0].start + 1)).toHaveLength(2)
    expect(tripArcs(data, data.trips[0].start - 1)).toHaveLength(0)
  })
  it('hands back the same array while the begun trips are unchanged', () => {
    const t = data.trips[0].start + 1
    expect(tripArcs(data, t)).toBe(tripArcs(data, t + 3600))
    expect(tripArcs(data)).toBe(tripArcs(data, Infinity))
  })
})
