import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { parseTimeline } from './parse'
import { buildData, type Cities } from './derive'
import type { Data } from '../data/types'
import type { Profile } from '../profile/profile'

const SRC = new URL('../../../timeline.json', import.meta.url).pathname
const pub = (f: string) => JSON.parse(readFileSync(new URL(`../../public/data/${f}.json`, import.meta.url), 'utf8'))

describe.skipIf(!existsSync(SRC))('in-browser pipeline matches the Python export', () => {
  const parsed = parseTimeline(readFileSync(SRC, 'utf8'))
  const cities = JSON.parse(readFileSync(new URL('../../public/cities.json', import.meta.url), 'utf8')) as Cities
  const py = { visits: pub('visits'), activities: pub('activities'), trips: pub('trips'), daily: pub('daily'), places: pub('places'), meta: pub('meta'), profile: pub('profile') }
  const profile: Profile = { name: null, units: 'km', homes: py.profile.homes ?? [{ ...py.profile.home, city: '', cc: '', from: 0, to: null }], works: py.profile.work ? [{ ...py.profile.work, from: 0, to: null }] : [] }
  const data: Data = buildData(parsed, cities, { file: 'timeline.json', sha256: 'x' }, profile)

  it('parses the same records', () => {
    expect(data.visits.length).toBe(py.visits.length)
    expect(data.activities.length).toBe(py.activities.length)
    expect(data.visits[0]).toEqual(py.visits[0])
    expect(data.activities[100]).toEqual(py.activities[100])
    expect(data.meta.range).toEqual(py.meta.range)
    expect(data.meta.import_report).toEqual(py.meta.import_report)
  })
  it('derives the same home, places, trips and days', () => {
    expect(data.profile.home.lat).toBeCloseTo(py.profile.home.lat, 5)
    expect(Object.keys(data.places).length).toBe(Object.keys(py.places).length)
    const id = Object.keys(py.places)[7]
    expect(data.places[id].n_visits).toBe(py.places[id].n_visits)
    expect(data.places[id].total_hours).toBeCloseTo(py.places[id].total_hours, 6)
    expect(data.trips.map((t) => [t.start, t.end, t.nights])).toEqual(py.trips.map((t: { start: number; end: number; nights: number }) => [t.start, t.end, t.nights]))
    expect(data.daily.length).toBe(py.daily.length)
    const d = data.daily[200], e = py.daily[200]
    expect([d.date, d.n_visits, d.hours_home, d.hours_transit, d.km_by_mode]).toEqual([e.date, e.n_visits, e.hours_home, e.hours_transit, e.km_by_mode])
  })
})

describe('foldRoles', () => {
  it('points every label of a home at its busiest id, per dated home', async () => {
    const { foldRoles } = await import('./derive')
    const profile: Profile = { name: null, units: 'km', works: [], homes: [{ lat: 42.3632761, lng: -71.0643721, city: '', cc: '', from: 0, to: 1000 }, { lat: 37.7749, lng: -122.4194, city: '', cc: '', from: 1000, to: null }] }
    const mk = (id: number, start: number, place_id: string, lat: number, lng: number) => ({ id, start, end: start + 3600, tz: 0, place_id, lat, lng, type: 'UNKNOWN', p: 0.9, lvl: 0 })
    const visits = [mk(1, 10, 'a', 42.3632761, -71.0643721), mk(2, 20, 'b', 42.3633, -71.0644), mk(3, 30, 'b', 42.3633, -71.0644), mk(4, 40, 'far', 42.4, -71.1), mk(5, 2000, 'c', 37.7749, -122.4194), mk(6, 2100, 'a', 42.3632761, -71.0643721)]
    expect(foldRoles(visits, profile).map((v) => v.place_id)).toEqual(['b', 'b', 'b', 'far', 'c', 'a'])
    expect(visits[0].place_id).toBe('a')
  })
  it('a home you came back to stays one Home; work only counts while the job ran', async () => {
    const { foldRoles, roleOf } = await import('./derive')
    const bos = { lat: 42.3632761, lng: -71.0643721, city: '', cc: '' }
    const profile: Profile = { name: null, units: 'km', homes: [{ ...bos, from: 0, to: 1000 }, { lat: 37.7749, lng: -122.4194, city: '', cc: '', from: 1000, to: 2000 }, { ...bos, from: 2000, to: null }], works: [{ lat: 42.35, lng: -71.05, place_id: 'w', from: 500, to: 1500 }] }
    const mk = (id: number, start: number, place_id: string, lat: number, lng: number) => ({ id, start, end: start + 3600, tz: 0, place_id, lat, lng, type: 'UNKNOWN', p: 0.9, lvl: 0 })
    const visits = [mk(1, 10, 'a', bos.lat, bos.lng), mk(2, 20, 'b', 42.3633, -71.0644), mk(3, 30, 'b', 42.3633, -71.0644), mk(4, 1500, 'c', 37.7749, -122.4194), mk(5, 2500, 'a', bos.lat, bos.lng), mk(6, 2600, 'a', bos.lat, bos.lng)]
    expect(foldRoles(visits, profile).map((v) => v.place_id)).toEqual(['a', 'a', 'a', 'c', 'a', 'a'])
    expect(roleOf(mk(7, 1500, 'c', 37.7749, -122.4194), profile)).toBe('home')
    expect(roleOf(mk(8, 1500, 'a', bos.lat, bos.lng), profile)).toBeNull()
    expect(roleOf(mk(9, 700, 'w', 42.35, -71.05), profile)).toBe('work')
    expect(roleOf(mk(10, 1700, 'w', 42.35, -71.05), profile)).toBeNull()
  })
})

describe('homeAt', () => {
  it('honours an explicit end date: the gap before the next home counts toward it', async () => {
    const { homeAt } = await import('../profile/profile')
    const h = (lat: number, from: number, to: number | null) => ({ lat, lng: 0, city: '', cc: '', from, to })
    const homes = [h(1, 0, 100), h(2, 200, null)]
    expect(homeAt(homes, 50).lat).toBe(1)
    expect(homeAt(homes, 150).lat).toBe(2)
    expect(homeAt(homes, 250).lat).toBe(2)
    expect(homeAt([h(1, 0, 100)], 500).lat).toBe(1)
  })
})
