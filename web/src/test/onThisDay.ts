import type { Activity, Daily, Data, Trip, Visit } from '../data/types'

/**
 * Four years of a made-up record for the "on this day" tests: Boston home, a Sydney week, a Paris
 * day trip on 15 Nov 2022, a Kyoto + Osaka week in Nov 2023 (hotel 11–17, temple on the 15th, dinner out on the 16th), an ordinary work day on 15 Nov 2024
 * and a return to Kyoto in May 2025. Each `onThisDayData()` call builds a fresh copy.
 */
export const at = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min) / 1000
export const BOS = { lat: 42.36, lng: -71.06 }, KYO = { lat: 35.01, lng: 135.77 }, OSA = { lat: 34.69, lng: 135.5 }
export const PAR = { lat: 48.86, lng: 2.35 }, SYD = { lat: -33.87, lng: 151.21 }, NYC = { lat: 40.71, lng: -74.01 }

let id = 0
export const v = (start: number, end: number, place_id: string, p: { lat: number; lng: number }, type = 'UNKNOWN'): Visit =>
  ({ id: id++, start, end, place_id, lat: p.lat, lng: p.lng, type, p: 1, lvl: 0, tz: 0 })
export const a = (start: number, end: number, mode: string, m: number, s: { lat: number; lng: number }, e: { lat: number; lng: number }): Activity =>
  ({ id: id++, start, end, mode, m, s_lat: s.lat, s_lng: s.lng, e_lat: e.lat, e_lng: e.lng, tz: 0, p: 1 })
export const place = (p: { lat: number; lng: number }, city: string | null, cc: string | null, name: string | null = null, role: 'home' | 'work' | null = null, primary_type: string | null = null) =>
  ({ ...p, label: null, role, city, country_code: cc, n_visits: 1, total_hours: 1, first_ts: 0, last_ts: 0, name, primary_type })
export const day = (date: string, x: Partial<Daily>): Daily =>
  ({ date, km_by_mode: {}, n_visits: 1, n_places: 1, n_new_places: 0, max_dist_from_home_km: 0, hours_home: 0, hours_work: 0, hours_other: 0, hours_transit: 0, cities: [], ...x })
export const trip = (start: number, end: number, nights: number, cities: string[], km: number): Trip =>
  ({ start, end, nights, max_dist_from_home_km: km, total_km_by_mode: { FLYING: km * 2 }, anchor_cities: cities, memory: null })

export const homeNight = (y: number, m: number, d: number) => v(at(y, m, d - 1, 20), at(y, m, d, 8), 'home', BOS, 'INFERRED_HOME')

export function onThisDayData(): Data {
  id = 0
  const visits: Visit[] = [
    // Sydney, the farthest the record goes.
    v(at(2022, 3, 10, 10), at(2022, 3, 13, 10), 'sydney-hotel', SYD),
    // Boston → Paris day: woke at home, flew, Louvre, hotel.
    homeNight(2022, 11, 14), homeNight(2022, 11, 15),
    v(at(2022, 11, 15, 13), at(2022, 11, 15, 18), 'louvre', PAR),
    v(at(2022, 11, 15, 20), at(2022, 11, 17, 9), 'paris-hotel', PAR),
    // A night in New York on 28 Feb 2023 (29 Feb fallback).
    v(at(2023, 2, 27, 22), at(2023, 2, 28, 20), 'nyc-hotel', NYC),
    // Kyoto week, Nov 2023.
    v(at(2023, 11, 11, 23), at(2023, 11, 17, 9), 'kyoto-hotel', KYO),
    v(at(2023, 11, 15, 10), at(2023, 11, 15, 13), 'kinkakuji', KYO),
    v(at(2023, 11, 16, 19), at(2023, 11, 16, 21), 'kyoto-restaurant', KYO),
    v(at(2023, 11, 17, 12), at(2023, 11, 18, 9), 'osaka-hotel', OSA),
    // An ordinary work day in 2024.
    homeNight(2024, 11, 15),
    v(at(2024, 11, 15, 9), at(2024, 11, 15, 17), 'work', BOS, 'INFERRED_WORK'),
    v(at(2024, 11, 15, 18), at(2024, 11, 16, 8), 'home', BOS, 'INFERRED_HOME'),
    // Back to Kyoto in 2025.
    v(at(2025, 5, 2, 15), at(2025, 5, 4, 9), 'kyoto-hotel', KYO),
  ].sort((x, y) => x.start - y.start)
  const activities: Activity[] = [
    a(at(2022, 3, 9, 10), at(2022, 3, 10, 8), 'FLYING', 16_200_000, BOS, SYD),
    a(at(2022, 11, 15, 6), at(2022, 11, 15, 12), 'FLYING', 5_500_000, BOS, PAR),
    a(at(2023, 11, 11, 8), at(2023, 11, 11, 22), 'FLYING', 10_800_000, BOS, KYO),
    a(at(2023, 11, 17, 10), at(2023, 11, 17, 11), 'IN_TRAIN', 45_000, KYO, OSA),
    a(at(2023, 11, 18, 12), at(2023, 11, 19, 2), 'FLYING', 10_800_000, OSA, BOS),
  ]
  const kyotoDays = [11, 12, 13, 14, 15, 16, 17].map((d) => day(`2023-11-${d}`, { max_dist_from_home_km: 10_800, cities: ['Kyoto'], n_new_places: d === 11 || d === 15 || d === 17 ? 1 : 0, hours_other: 20 }))
  return {
    visits, activities, paths: [], strokes: [],
    places: {
      home: place(BOS, 'Boston', 'US', null, 'home'), work: place(BOS, 'Boston', 'US', null, 'work'),
      'sydney-hotel': place(SYD, 'Sydney', 'AU', 'Sydney Hotel'),
      louvre: place(PAR, 'Paris', 'FR', 'Louvre', null, 'museum'), 'paris-hotel': place(PAR, 'Paris', 'FR', 'Paris Hotel', null, 'lodging'),
      'nyc-hotel': place(NYC, 'New York', 'US', 'NYC Hotel'),
      'kyoto-hotel': place(KYO, 'Kyoto', 'JP', 'Kyoto Hotel', null, 'lodging'), kinkakuji: place(KYO, 'Kyoto', 'JP', 'Kinkaku-ji', null, 'temple'),
      'kyoto-restaurant': place(KYO, 'Kyoto', 'JP', 'Izakaya', null, 'restaurant'),
      'osaka-hotel': place(OSA, 'Osaka', 'JP', 'Osaka Hotel', null, 'lodging'),
    },
    daily: [
      day('2022-03-10', { max_dist_from_home_km: 16_200, cities: ['Sydney'], n_new_places: 1 }),
      day('2022-11-14', { max_dist_from_home_km: 5, cities: ['Boston'], hours_home: 12 }),
      day('2022-11-15', { max_dist_from_home_km: 5500, cities: ['Boston', 'Paris'], n_new_places: 2, hours_transit: 6, hours_other: 7 }),
      day('2023-02-28', { max_dist_from_home_km: 300, cities: ['New York'], n_new_places: 1, hours_other: 20 }),
      ...kyotoDays,
      day('2023-11-18', { max_dist_from_home_km: 10_700, cities: ['Osaka'], hours_other: 9, hours_transit: 14 }),
      day('2024-11-14', { max_dist_from_home_km: 5, cities: ['Boston'], hours_home: 12 }),
      day('2024-11-15', { max_dist_from_home_km: 5, cities: ['Boston'], hours_work: 8, hours_home: 14 }),
      day('2025-05-03', { max_dist_from_home_km: 10_800, cities: ['Kyoto'], hours_other: 24 }),
    ],
    trips: [
      trip(at(2022, 3, 9, 10), at(2022, 3, 13, 10), 3, ['Sydney'], 16_200),
      trip(at(2022, 11, 15, 6), at(2022, 11, 17, 9), 2, ['Paris'], 5500),
      trip(at(2023, 11, 11, 8), at(2023, 11, 19, 2), 7, ['Kyoto', 'Osaka'], 10_800),
      trip(at(2025, 5, 2, 15), at(2025, 5, 4, 9), 2, ['Kyoto'], 10_800),
    ],
    profile: { home: BOS, homes: [{ ...BOS, city: 'Boston', cc: 'US', from: 0, to: null }], works: [], frequent_places: [], frequent_trips: [], persona: null },
    meta: { source_file: '', source_sha256: '', built_at: 0, range: [at(2022, 1, 1), at(2025, 6, 1)], import_report: { segments_total: 0, parsed: 0, skipped_by_reason: {} } },
  }
}
