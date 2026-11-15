import { onePerCity, onePerCountry, placesInCity, dayRange, monthRange, tripId } from './doors'
import type { Place } from '../data/types'

const p = (city: string | null, cc: string | null, n: number): Place => ({ lat: 0, lng: 0, label: null, role: null, city, country_code: cc, n_visits: n, total_hours: 0, first_ts: 0, last_ts: 0, name: null })
const places = { a: p('Lisbon', 'PT', 3), b: p('Lisbon', 'PT', 9), c: p('Porto', 'PT', 1), d: p('Paris', 'FR', 2), e: p(null, null, 50) }

test('onePerCountry picks the most visited pin in each country', () => {
  expect(onePerCountry(places).sort()).toEqual(['b', 'd'])
})
test('onePerCity picks the most visited pin in each city', () => {
  expect(onePerCity(places).sort()).toEqual(['b', 'c', 'd'])
})
test('placesInCity lists every pin in a city', () => {
  expect(placesInCity(places, 'Lisbon').sort()).toEqual(['a', 'b'])
  expect(placesInCity(places, 'Rome')).toEqual([])
})
test('dayRange covers the local day around an instant', () => {
  const ts = Date.UTC(2025, 5, 10, 12) / 1000
  expect(dayRange(ts, 0)).toEqual([Date.UTC(2025, 5, 10) / 1000, Date.UTC(2025, 5, 11) / 1000 - 1])
  // 01:00 UTC at UTC-5 is still the 9th locally.
  expect(dayRange(Date.UTC(2025, 5, 10, 1) / 1000, -300)[0]).toBe(Date.UTC(2025, 5, 9, 5) / 1000)
})
test('monthRange and tripId', () => {
  expect(monthRange('2025-02')).toEqual([Date.UTC(2025, 1, 1) / 1000, Date.UTC(2025, 2, 1) / 1000 - 1])
  expect(tripId({ start: 5, end: 9 })).toBe('5-9')
})
