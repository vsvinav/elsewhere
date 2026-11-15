import { describe, expect, it } from 'vitest'
import {
  highlightFor, highlightOn, highlightState, followUps, indexOf, localDay, MAX_DEPTH,
  stayLength, distanceFromHome, tripSetlist, routeRange, compareYears, whatDidIDo, haveIBeenBack, farthestEver, thisTimeLastYear,
} from './highlights'
import type { Data, Daily, Trip, Visit, Activity } from '../data/types'
import { onThisDayData as fixture, at, v, place, day, trip, BOS, KYO } from '../test/onThisDay'

const data = fixture()

describe('picking the highlight', () => {
  it('scores a day away, in a trip, with new places, distance and a first city', () => {
    // 2022-11-15 Paris: +50 away, +30 trip, +20 two new places, +11 (5500/500), +15 first time in Paris.
    const h = highlightFor(data, '2025-11-15')!
    expect(h.date).toBe('2022-11-15')
    expect(h.score).toBe(126)
    expect(h.yearsAgo).toBe(3)
    expect(h.scope).toBe('day')
  })
  it('penalises an all-home-or-work day below zero so it never wins', () => {
    expect(highlightOn(data, '2024-11-15', 1).score).toBe(-40)
    expect(highlightFor(data, '2025-11-14')!.date).toBe('2023-11-14')
  })
  it('caps the distance bonus at 20', () => {
    // Kyoto 11-14: +50 +30 +0 new +min(20, 22) = 100.
    expect(highlightOn(data, '2023-11-14', 2).score).toBe(100)
  })
  it('breaks ties in favour of the oldest year', () => {
    const d = fixture()
    // Two Kyoto-identical days one year apart: same visits, same daily. Copy 2023-11-13 into 2024-11-13.
    const shift = at(2024, 11, 13) - at(2023, 11, 13)
    d.visits.push(v(at(2023, 11, 13, 0) + shift, at(2023, 11, 13, 23) + shift, 'kyoto-hotel', KYO))
    d.visits.sort((x, y) => x.start - y.start)
    d.daily.push(day('2024-11-13', { max_dist_from_home_km: 10_800, cities: ['Kyoto'], hours_other: 20 }))
    d.daily.sort((x, y) => x.date.localeCompare(y.date))
    d.trips.push(trip(at(2024, 11, 13), at(2024, 11, 14), 1, ['Kyoto'], 10_800))
    const h = highlightFor(d, '2025-11-13')!
    expect(highlightOn(d, '2024-11-13', 1).score).toBe(highlightOn(d, '2023-11-13', 2).score)
    expect(h.date).toBe('2023-11-13')
  })
  it('falls back to 28 Feb when today is 29 Feb', () => {
    const h = highlightFor(data, '2028-02-29')!
    expect(h.date).toBe('2023-02-28')
    expect(h.city).toBe('New York')
  })
  it('widens to ±3 days and labels the result "this week"', () => {
    const h = highlightFor(data, '2025-11-20')!
    expect(h.scope).toBe('week')
    expect(['2023-11-17', '2023-11-18']).toContain(h.date)
  })
  it('returns null on a quiet day', () => {
    expect(highlightFor(data, '2025-07-20')).toBeNull()
  })
  it('only looks at past years, never the current one', () => {
    expect(highlightFor(data, '2025-05-03')).toBeNull()
    expect(highlightFor(data, '2026-05-03')!.date).toBe('2025-05-03')
  })
})

describe('headline verb', () => {
  it('"woke up in" when the first visit is a night stay', () => {
    const h = highlightOn(data, '2023-11-14', 2)
    expect(h.verb).toBe('woke up in'); expect(h.city).toBe('Kyoto')
  })
  it('"landed in" when the first leg of the day is a flight', () => {
    const h = highlightOn(data, '2022-11-15', 3)
    expect(h.verb).toBe('landed in'); expect(h.city).toBe('Paris')
  })
  it('"arrived in" when the first visit is a new city after sleeping elsewhere', () => {
    const h = highlightOn(data, '2023-11-17', 2)
    // Woke in Kyoto, took the train: the day belongs to Kyoto (first visit) and reads "woke up in".
    expect(h.verb).toBe('woke up in')
    const d = fixture()
    // Drop the hotel's last morning so the day starts with the train and the Osaka hotel.
    d.visits = d.visits.map((x) => (x.place_id === 'kyoto-hotel' && x.start === at(2023, 11, 11, 23) ? { ...x, end: at(2023, 11, 16, 23) } : x))
    expect(highlightOn(d, '2023-11-17', 2).verb).toBe('arrived in')
  })
  it('"were in" otherwise: the day opens at a late stop in the city you then slept in', () => {
    const d = fixture()
    d.visits = d.visits.flatMap((x) => (x.place_id === 'kyoto-hotel' && x.start === at(2023, 11, 11, 23)
      ? [{ ...x, end: at(2023, 11, 14, 23) }, v(at(2023, 11, 14, 23, 30), at(2023, 11, 15, 1), 'kyoto-bar', KYO), { ...x, id: 99, start: at(2023, 11, 15, 1, 30) }]
      : [x])).sort((x, y) => x.start - y.start)
    d.places['kyoto-bar'] = place(KYO, 'Kyoto', 'JP', 'Bar')
    const h = highlightOn(d, '2023-11-15', 2)
    expect(h.firstVisit.place_id).toBe('kyoto-bar')
    expect(h.verb).toBe('were in')
  })
  it('prints coordinates when the city is unknown', () => {
    const d = fixture()
    d.places['nyc-hotel'] = { ...d.places['nyc-hotel'], city: null }
    const h = highlightOn(d, '2023-02-28', 2)
    expect(h.cityKnown).toBe(false)
    expect(h.city).toMatch(/40\.71°, -74\.01°/)
  })
})

describe('tier 1 facts', () => {
  it('picks the first three that apply, in priority order', () => {
    const h = highlightOn(data, '2023-11-14', 2)
    expect(h.facts.map((f) => f.id)).toEqual(['trip', 'km', 'week'])
    expect(h.facts[0].label).toBe('3 nights into a 7-night trip')
    expect(h.facts[1].label).toBe('10,800 km from home')
    expect(h.facts[2].strip).toHaveLength(7)
  })
  it('includes first-city, new places and transit when they apply', () => {
    const h = highlightOn(data, '2022-11-15', 3)
    expect(h.facts.map((f) => f.id)).toEqual(['trip', 'km', 'first'])
    const d = fixture(); d.trips = []
    const h2 = highlightOn(d, '2022-11-15', 3)
    expect(h2.facts.map((f) => f.id)).toEqual(['km', 'first', 'new'])
  })
  it('hides distance facts when no home is set', () => {
    const d = { ...fixture(), profile: { ...data.profile, homes: [] } }
    expect(highlightOn(d, '2023-11-14', 2).facts.map((f) => f.id)).not.toContain('km')
  })
  it('every fact is a door with a range and place ids', () => {
    const h = highlightOn(data, '2023-11-14', 2)
    for (const f of h.facts) { expect(f.range[0]).toBeLessThan(f.range[1]); expect(Array.isArray(f.placeIds)).toBe(true) }
    expect(h.range).toEqual([at(2023, 11, 14), at(2023, 11, 15)])
    expect(h.playhead).toBe(at(2023, 11, 11, 23))
    expect(h.placeIds).toEqual(['kyoto-hotel'])
  })
})

describe('empty states', () => {
  it('quiet day names the nearest highlight by calendar distance', () => {
    const s = highlightState(data, '2025-11-20')
    expect(s.kind).toBe('highlight')
    const q = highlightState(data, '2025-07-20')
    expect(q.kind).toBe('quiet')
    if (q.kind === 'quiet') { expect(q.nearest?.date).toBe('2025-05-03'); expect(q.nearest?.city).toBe('Kyoto') }
  })
  it('record shorter than a year shows the top-scoring day instead', () => {
    const d = fixture()
    d.meta.range = [at(2023, 3, 3), at(2023, 5, 1)]
    const s = highlightState(d, '2023-04-10')
    expect(s.kind).toBe('short')
    if (s.kind === 'short') { expect(s.starts).toBe('2023-03-03'); expect(s.highlight.date).toBe('2022-11-15') }
  })
})

describe('follow-ups', () => {
  const kyoto = highlightOn(data, '2023-11-14', 2)
  const paris = highlightOn(data, '2022-11-15', 3)

  it('offers only the questions that have an answer', () => {
    const ids = followUps(data, kyoto).map((f) => f.id)
    expect(ids).toEqual(['stay', 'distance', 'trip', 'route', 'compare', 'did', 'back', 'farthest'])
    expect(ids).not.toContain('lastYear') // 2022-11-14 was an ordinary day at home
    expect(followUps(data, highlightOn(data, '2023-11-15', 2)).map((f) => f.id)).toContain('lastYear')
  })
  it('stayLength is the contiguous run of nights in the city around the day', () => {
    const s = stayLength(data, kyoto)!
    expect(s).toMatchObject({ nights: 6, from: '2023-11-12', to: '2023-11-17' })
    expect(s.strip).toHaveLength(6)
    expect(s.title).toBe('6 nights')
    expect(s.detail).toBe('12–17 Nov 2023')
    expect(s.placeIds).toEqual(['kyoto-hotel'])
    expect(stayLength(data, paris)!.nights).toBe(2)
  })
  it('distanceFromHome names the leg that got you there', () => {
    const d = distanceFromHome(data, kyoto)!
    expect(Math.round(d.km)).toBe(10_989)
    expect(d.leg).toMatchObject({ mode: 'FLYING', from: 'Boston', to: 'Kyoto', hours: 14 })
    expect(d.title).toBe('10,989 km')
    expect(d.detail).toBe('flew Boston → Kyoto, 14 h')
    expect(distanceFromHome({ ...data, profile: { ...data.profile, homes: [] } }, kyoto)).toBeNull()
  })
  it('tripSetlist lists the cities with nights, marking firsts', () => {
    const t = tripSetlist(data, kyoto)!
    expect(t.cities.map((c) => [c.city, c.nights, c.first])).toEqual([['Kyoto', 6, true], ['Osaka', 1, true]])
    expect(t.cities[1].range[0]).toBeLessThan(t.cities[1].range[1])
    expect(t.range).toEqual([at(2023, 11, 11, 8), at(2023, 11, 19, 2)])
    expect(tripSetlist(data, highlightOn(data, '2023-02-28', 2))).toBeNull()
  })
  it('routeRange covers the trip and counts its legs', () => {
    const r = routeRange(data, kyoto)!
    expect(r.range).toEqual([at(2023, 11, 11, 8), at(2023, 11, 19, 2)])
    expect(r.legs).toBe(3)
    expect(r.km).toBeCloseTo(21_645)
  })
  it('compareYears gives one column per year with the city and distance', () => {
    const c = compareYears(data, kyoto)!
    expect(c.years).toEqual([
      { year: 2022, city: 'Boston', km: 5, now: false },
      { year: 2023, city: 'Kyoto', km: 10_800, now: true },
      { year: 2024, city: 'Boston', km: 5, now: false },
    ])
    const d = fixture(); d.daily = d.daily.filter((x) => x.date === '2023-02-28')
    expect(compareYears(d, highlightOn(d, '2023-02-28', 2))).toBeNull()
  })
  it('whatDidIDo lists the stops of the day with durations', () => {
    const w = whatDidIDo(data, highlightOn(data, '2023-11-15', 2))!
    expect(w.stops.map((s) => [s.name, s.type, Math.round(s.hours)])).toEqual([['Kyoto Hotel', 'lodging', 24], ['Kinkaku-ji', 'temple', 3]])
    expect(w.placeIds).toEqual(['kyoto-hotel', 'kinkakuji'])
  })
  it('haveIBeenBack counts returns after the stay ended and dates the last', () => {
    // 15 Nov (temple) is still the same stay; May 2025 is the one return.
    expect(haveIBeenBack(data, kyoto)).toMatchObject({ times: 1, last: '2025-05-04', title: 'Once', detail: 'last 4 May 2025' })
    expect(haveIBeenBack(data, paris)).toMatchObject({ times: 0, last: null, title: 'Never', detail: '2 years and counting' })
  })
  it('farthestEver compares against the record', () => {
    expect(farthestEver(data, kyoto)).toMatchObject({ is: false, date: '2022-03-10', km: 16_200, city: 'Sydney', title: 'No' })
    expect(farthestEver(data, highlightOn(data, '2022-03-10', 3))).toMatchObject({ is: true, title: 'Yes' })
    expect(farthestEver({ ...data, profile: { ...data.profile, homes: [] } }, kyoto)).toBeNull()
  })
  it('thisTimeLastYear is another highlight, and chains', () => {
    const h = thisTimeLastYear(data, highlightOn(data, '2023-11-15', 2))!
    expect(h.highlight.date).toBe('2022-11-15')
    expect(h.highlight.yearsAgo).toBe(3)
    expect(thisTimeLastYear(data, kyoto)).toBeNull()
  })
  it('chaining stops at depth 4', () => {
    expect(followUps(data, kyoto, MAX_DEPTH - 1).length).toBeGreaterThan(0)
    expect(followUps(data, kyoto, MAX_DEPTH)).toEqual([])
  })
  it('every answer is a door', () => {
    for (const f of followUps(data, kyoto)) {
      expect(f.answer.range[0]).toBeLessThanOrEqual(f.answer.range[1])
      expect(Array.isArray(f.answer.placeIds)).toBe(true)
    }
  })
})

describe('hot path', () => {
  it('indexes a record once and answers in sub-linear time per query', () => {
    // 100k top-level visits over three years, a few hundred a day, with a flight every 30 days.
    const start = at(2022, 1, 1)
    const visits: Visit[] = [], activities: Activity[] = [], daily: Daily[] = [], trips: Trip[] = []
    const places: Data['places'] = { home: place(BOS, 'Boston', 'US', null, 'home') }
    for (let i = 0; i < 100_000; i++) {
      const t = start + i * 950
      const far = Math.floor(i / 2700) % 30 === 29
      const pid = far ? `far${Math.floor(i / 2700)}` : `p${i % 500}`
      if (!places[pid]) places[pid] = place(far ? KYO : BOS, far ? `City ${pid}` : 'Boston', far ? 'JP' : 'US', pid)
      visits.push(v(t, t + 900, pid, far ? KYO : BOS))
    }
    const days = Math.ceil((visits[visits.length - 1].end - start) / 86400)
    for (let d = 0; d < days; d++) {
      const far = Math.floor((d * 86400) / (2700 * 950)) % 30 === 29
      daily.push(day(localDay(start + d * 86400, 0), { max_dist_from_home_km: far ? 10_800 : 3, hours_other: 20, n_new_places: 2 }))
      if (far && d % 7 === 0) trips.push(trip(start + d * 86400, start + (d + 7) * 86400, 7, ['Kyoto'], 10_800))
    }
    const big: Data = { ...data, visits, activities, daily, trips, places, meta: { ...data.meta, range: [start, visits[visits.length - 1].end] } }
    const t0 = performance.now()
    const ix = indexOf(big)
    const built = performance.now() - t0
    expect(indexOf(big)).toBe(ix)
    const t1 = performance.now()
    let n = 0
    for (let m = 1; m <= 12; m++) for (let d = 1; d <= 28; d += 3) {
      const h = highlightFor(big, `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
      if (h) { followUps(big, h); n++ }
    }
    const queried = performance.now() - t1
    expect(n).toBeGreaterThan(0)
    expect(built).toBeLessThan(1500)
    expect(queried).toBeLessThan(1500)
  })
})
