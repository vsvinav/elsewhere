import { describe, expect, it } from 'vitest'
import { earnedIds, passport, tilt } from './passport'
import type { Data } from '../data/types'

const H = 3600, D = 86400
const JAN = Date.UTC(2025, 0, 1) / 1000
const v = (start: number, end: number, place_id: string, lat: number, lng: number, tz = 0) => ({ start, end, place_id, type: 'UNKNOWN', lvl: 0, lng, lat, tz, id: 0, p: 1 })
const place = (role: 'home' | null, city: string, country_code: string | null, lat: number, lng: number) =>
  ({ lng, lat, role, city, country_code, n_visits: 1, first_ts: JAN, last_ts: JAN, name: null, total_hours: 1 })
const act = (start: number, end: number, m: number) => ({ start, end, mode: 'FLYING', m, s_lat: 0, s_lng: 0, e_lat: 1, e_lng: 1, tz: 0, id: 0, p: 1 })

/**
 * Three countries, five cities and one stop nowhere: Paris 3 nights, Lyon 2, Tokyo 5, Rome 2, Osaka 2, Atlantis 1 — 15 nights,
 * so 10 is earned and 100 is not. One 45,000 km flight laps the Earth; every visit sits in one time zone.
 */
const data = {
  visits: [
    v(JAN, JAN + 3 * D, 'home', 42.36, -71.06),
    v(JAN + 4 * D, JAN + 7 * D - 12 * H, 'paris', 48.85, 2.35),
    v(JAN + 9 * D, JAN + 11 * D - 12 * H, 'lyon', 45.76, 4.84),
    v(JAN + 14 * D, JAN + 19 * D - 12 * H, 'tokyo', 35.68, 139.69),
    v(JAN + 24 * D, JAN + 26 * D - 12 * H, 'rome', 41.9, 12.5),
    v(JAN + 31 * D, JAN + 33 * D - 12 * H, 'osaka', 34.69, 135.5),
    v(JAN + 40 * D, JAN + 41 * D - 12 * H, 'atlantis', 30, -40),
  ],
  activities: [act(JAN + 2 * H, JAN + 3 * H, 40_000), act(JAN + 4 * D - 10 * H, JAN + 4 * D - 2 * H, 45_000_000)],
  paths: [], strokes: [],
  places: {
    home: place('home', 'Boston', 'US', 42.36, -71.06),
    paris: place(null, 'Paris', 'FR', 48.85, 2.35),
    lyon: place(null, 'Lyon', 'FR', 45.76, 4.84),
    tokyo: place(null, 'Tokyo', 'JP', 35.68, 139.69),
    rome: place(null, 'Rome', 'IT', 41.9, 12.5),
    osaka: place(null, 'Osaka', 'JP', 34.69, 135.5),
    atlantis: place(null, 'Atlantis', null, 30, -40),
  },
  daily: [], trips: [],
  profile: { home: { lat: 42.36, lng: -71.06 } },
  meta: { range: [JAN, JAN + 45 * D] },
} as unknown as Data

describe('passport', () => {
  const p = passport(data)
  const page = (id: string) => p.pages.find((x) => x.id === id)!
  const stamp = (pageId: string, id: string) => page(pageId).stamps.find((s) => s.id === id)!

  it('one page per country in first-earned order, stops nowhere on ELSEWHERE, milestones last', () => {
    expect(p.pages.map((x) => x.title)).toEqual(['FR', 'JP', 'IT', 'ELSEWHERE', 'MILESTONES'])
    expect(p.pages.map((x) => x.kind)).toEqual(['country', 'country', 'country', 'country', 'milestone'])
  })

  it('city stamps are dated on the first night, carry the nights and open the beds', () => {
    expect(page('country:FR').stamps.map((s) => s.label)).toEqual(['PARIS', 'LYON'])
    const paris = stamp('country:FR', 'city:Paris')
    expect(paris.earnedAt).toBe(JAN + 4 * D)
    expect(paris.sub).toBe('3 nights')
    expect(paris.door).toEqual({ kind: 'places', placeIds: ['paris'], label: 'Paris' })
    expect(stamp('country:ELSEWHERE', 'city:Atlantis').sub).toBe('1 night')
    expect(page('country:JP').stamps.map((s) => s.label)).toEqual(['TOKYO', 'OSAKA'])
  })

  it('milestones: earned ones dated, the rest ghosted with no door', () => {
    const ms = page('milestones')
    expect(ms.stamps.map((s) => s.label)).toEqual([
      'FIRST NIGHT AWAY', '10 NIGHTS AWAY', '100 NIGHTS AWAY', '1,000 NIGHTS AWAY', '5 CITIES', '25 CITIES', '100 CITIES',
      '3 COUNTRIES', '10 COUNTRIES', '25 COUNTRIES', '1 LAP OF EARTH', '10 TIME ZONES',
    ])
    expect(stamp('milestones', 'ms:first-night').earnedAt).toBe(JAN + 4 * D)
    // the tenth night is the fifth in Tokyo: 5 nights before it, Tokyo's first night plus four days
    expect(stamp('milestones', 'ms:nights-10').earnedAt).toBe(JAN + 18 * D)
    expect(stamp('milestones', 'ms:nights-100').earnedAt).toBeNull()
    expect(stamp('milestones', 'ms:nights-100').door).toBeNull()
    expect(stamp('milestones', 'ms:cities-5').earnedAt).toBe(JAN + 31 * D)
    expect(stamp('milestones', 'ms:cities-25').earnedAt).toBeNull()
    expect(stamp('milestones', 'ms:countries-3').earnedAt).toBe(JAN + 24 * D)
    expect(stamp('milestones', 'ms:countries-10').earnedAt).toBeNull()
    expect(stamp('milestones', 'ms:lap').earnedAt).toBe(JAN + 4 * D - 2 * H)
    expect(stamp('milestones', 'ms:zones').earnedAt).toBeNull()
    expect(stamp('milestones', 'ms:lap').door).toEqual({ kind: 'range', from: JAN + 3 * D - 2 * H, to: JAN + 5 * D - 2 * H, label: '1 LAP OF EARTH' })
  })

  it('earnedIds lists every dated stamp across the booklet', () => {
    expect(earnedIds(p)).toEqual(['city:Paris', 'city:Lyon', 'city:Tokyo', 'city:Osaka', 'city:Rome', 'city:Atlantis', 'ms:first-night', 'ms:nights-10', 'ms:cities-5', 'ms:countries-3', 'ms:lap'])
  })

  it('an empty record is a booklet of outlines', () => {
    const e = passport({ ...data, visits: [], activities: [] })
    expect(e.pages).toHaveLength(1)
    expect(e.pages[0].stamps.every((s) => s.earnedAt == null)).toBe(true)
  })

  it('tilt is deterministic and within ±6°', () => {
    expect(tilt('city:Paris')).toBe(tilt('city:Paris'))
    expect(tilt('city:Paris')).not.toBe(tilt('city:Lyon'))
    for (const id of ['a', 'ms:lap', 'city:Tokyo', 'country:FR']) { expect(Math.abs(tilt(id))).toBeLessThanOrEqual(6) }
  })

  it('300k visits in a few hundred ms', () => {
    const visits = [], places: Record<string, unknown> = { home: place('home', 'Boston', 'US', 42.36, -71.06) }
    for (let i = 0; i < 300_000; i++) {
      const city = `City ${i % 2000}`, pid = `p${i % 2000}`
      places[pid] = place(null, city, `C${i % 60}`, 10 + (i % 50), (i % 300) - 150)
      visits.push(v(JAN + i * 4 * H, JAN + i * 4 * H + 3 * H, pid, 10 + (i % 50), (i % 300) - 150, (i % 24) * 60))
    }
    const big = { ...data, visits, places, activities: Array.from({ length: 100_000 }, (_, i) => act(JAN + i * H, JAN + i * H + 1800, 1000)) } as unknown as Data
    const t0 = performance.now()
    const r = passport(big)
    expect(performance.now() - t0).toBeLessThan(1500)
    expect(r.pages.length).toBeGreaterThan(1)
  })
})
