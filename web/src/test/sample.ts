import { parseTimeline } from '../ingest/parse'
import { buildData, type Cities } from '../ingest/derive'
import type { Data } from '../data/types'
import type { Profile } from '../profile/profile'

const HOME = { lat: 37.33, lng: -121.89 }, WORK = { lat: 37.39, lng: -122.08 }, BOS = { lat: 42.36, lng: -71.06 }, PARIS = { lat: 48.86, lng: 2.35 }
const ll = (p: { lat: number; lng: number }) => `${p.lat}°, ${p.lng}°`
const iso = (t: number) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z')
const H = 3600e3, D = 24 * H, T0 = Date.UTC(2024, 0, 8)

/**
 * Three months of a made-up record: weekday commutes, a café, a drive to Boston's cousin Monterey,
 * a flight to Boston and one to Paris. Small enough to build in a few ms, varied enough to light every tab.
 */
export function sampleTimeline(): string {
  const segs: unknown[] = []
  const visit = (start: number, end: number, p: { lat: number; lng: number }, id: string, type: string) =>
    segs.push({ startTime: iso(start), endTime: iso(end), startTimeTimezoneUtcOffsetMinutes: -480, visit: { hierarchyLevel: 0, probability: 0.9, topCandidate: { placeId: id, semanticType: type, probability: 0.9, placeLocation: { latLng: ll(p) } } } })
  const move = (start: number, end: number, a: { lat: number; lng: number }, b: { lat: number; lng: number }, mode: string, m: number) =>
    segs.push({ startTime: iso(start), endTime: iso(end), startTimeTimezoneUtcOffsetMinutes: -480, activity: { start: { latLng: ll(a) }, end: { latLng: ll(b) }, distanceMeters: m, probability: 0.8, topCandidate: { type: mode, probability: 0.8 } } })
  const cafe = { lat: 37.335, lng: -121.885 }, monterey = { lat: 36.6, lng: -121.89 }
  for (let d = 0; d < 90; d++) {
    const day = T0 + d * D, dow = (d + 1) % 7
    if (d === 40) { // fly to Boston for three nights
      move(day + 9 * H, day + 15 * H, HOME, BOS, 'FLYING', 4_300_000)
      visit(day + 16 * H, day + 3 * D + 8 * H, BOS, 'bos-hotel', 'UNKNOWN')
      move(day + 3 * D + 9 * H, day + 3 * D + 16 * H, BOS, HOME, 'FLYING', 4_300_000)
      continue
    }
    if (d > 40 && d < 44) continue
    if (d === 70) { // and a week in Paris
      move(day + 18 * H, day + 1 * D + 6 * H, HOME, PARIS, 'FLYING', 9_000_000)
      visit(day + 1 * D + 8 * H, day + 7 * D + 10 * H, PARIS, 'paris-flat', 'UNKNOWN')
      move(day + 7 * D + 12 * H, day + 8 * D + 2 * H, PARIS, HOME, 'FLYING', 9_000_000)
      continue
    }
    if (d > 70 && d < 79) continue
    visit(day - 4 * H, day + 8 * H, HOME, 'home', 'HOME')
    if (dow === 6) { // Saturday drive down the coast
      move(day + 9 * H, day + 11 * H, HOME, monterey, 'IN_PASSENGER_VEHICLE', 115_000)
      visit(day + 11 * H, day + 16 * H, monterey, 'monterey-aquarium', 'UNKNOWN')
      move(day + 16 * H, day + 18 * H, monterey, HOME, 'IN_PASSENGER_VEHICLE', 115_000)
    } else if (dow !== 0) {
      move(day + 8 * H, day + 9 * H, HOME, WORK, 'IN_PASSENGER_VEHICLE', 22_000)
      visit(day + 9 * H, day + 17 * H, WORK, 'work', 'WORK')
      move(day + 17 * H, day + 17.5 * H, WORK, cafe, 'IN_PASSENGER_VEHICLE', 20_000)
      visit(day + 17.5 * H, day + 18.5 * H, cafe, 'cafe', 'UNKNOWN')
      move(day + 18.5 * H, day + 19 * H, cafe, HOME, 'WALKING', 800)
    }
    visit(day + 19 * H, day + 1 * D - 4 * H, HOME, 'home', 'HOME')
  }
  return JSON.stringify({ semanticSegments: segs })
}

export const sampleCities: Cities = { lat: [37.34, 42.36, 48.86, 36.6], lng: [-121.89, -71.06, 2.35, -121.89], name: ['San Jose', 'Boston', 'Paris', 'Monterey'], cc: ['US', 'US', 'FR', 'US'] }
const profile: Profile = { name: 'Sam', units: 'km', homes: [{ ...HOME, city: 'San Jose', cc: 'US', from: 0, to: null }], works: [{ ...WORK, place_id: 'work', from: 0, to: null }] }

/** A full `Data` built through the real import pipeline from `sampleTimeline()`. */
export function sampleData(): Data {
  return buildData(parseTimeline(sampleTimeline()), sampleCities, { file: 'sample.json', sha256: 'sample' }, profile)
}
