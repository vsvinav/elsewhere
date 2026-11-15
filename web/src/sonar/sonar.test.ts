import { describe, expect, it } from 'vitest'
import { ABSENCE_MIN_DAYS, DEBOUNCE_MS, FRESH_MS, HABITAT_DAYS, HABITAT_MIN_DAYS, RADIUS_M, absenceDays, debounced, decide, eligible, isHabitat, metres, newcomerAbsence, recordHit, stintStart, within, type DayAt, type Debounce, type Fix, type Side } from './sonar'

const NOW = Date.UTC(2025, 10, 15, 16, 0, 0)
const LIS = { lat: 38.7223, lng: -9.1393 }
const HOUR = 3600_000, DAY = 24 * HOUR
const fix = (ts: number, lat = LIS.lat, lng = LIS.lng): Fix => ({ ts, lat, lng })
// ~1° lng at 38.7° N is about 86.9 km; 0.001° ≈ 87 m.
const east = (m: number) => LIS.lng + m / 86_900
const side = (p: Partial<Side> = {}): Side => ({ fix: fix(NOW - 60_000), habitat: false, absenceDays: 200, ...p })
const dayAt = (daysAgo: number, lat = LIS.lat, lng = LIS.lng): DayAt => ({ localDay: new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10), lat, lng })
const none: Debounce = { lastHitByPair: {} }
const PAIR = 'YNSO47A5246FH5MO'

describe('constants', () => {
  it('match the contract', () => {
    expect([RADIUS_M, HABITAT_DAYS, HABITAT_MIN_DAYS, ABSENCE_MIN_DAYS, DEBOUNCE_MS, FRESH_MS]).toEqual([1609, 30, 4, 14, 24 * HOUR, 10 * 60_000])
  })
})

describe('geometry', () => {
  it('metres is haversine on 6371 km and within uses the mile', () => {
    expect(metres(fix(0), fix(0, LIS.lat, east(1000)))).toBeCloseTo(1000, -1)
    expect(within(fix(0), fix(0, LIS.lat, east(1500)))).toBe(true)
    expect(within(fix(0), fix(0, LIS.lat, east(1700)))).toBe(false)
  })
})

describe('isHabitat', () => {
  it('4 distinct days in the window → true, 3 → false', () => {
    expect(isHabitat([dayAt(1), dayAt(3), dayAt(9), dayAt(20)], fix(NOW), NOW)).toBe(true)
    expect(isHabitat([dayAt(1), dayAt(3), dayAt(9)], fix(NOW), NOW)).toBe(false)
  })
  it('the same day twice counts once', () => {
    expect(isHabitat([dayAt(1), dayAt(1), dayAt(3), dayAt(9)], fix(NOW), NOW)).toBe(false)
  })
  it('4 days but 31 days ago → false', () => {
    expect(isHabitat([dayAt(31), dayAt(33), dayAt(35), dayAt(40)], fix(NOW), NOW)).toBe(false)
  })
  it('days outside the radius do not count', () => {
    expect(isHabitat([dayAt(1), dayAt(2), dayAt(3), dayAt(4, LIS.lat, east(3000))], fix(NOW), NOW)).toBe(false)
  })
  it('scans 1e5 rows in under 50 ms', () => {
    const rows: DayAt[] = []
    for (let i = 0; i < 100_000; i++) rows.push(dayAt(i % 400, LIS.lat + ((i % 97) - 48) * 0.01, LIS.lng + ((i % 89) - 44) * 0.01))
    const t0 = performance.now()
    isHabitat(rows, fix(NOW), NOW)
    expect(performance.now() - t0).toBeLessThan(50)
  })
})

describe('stintStart and absenceDays', () => {
  it('stintStart walks back only contiguous in-radius fixes', () => {
    const fixes = [fix(NOW - 5 * HOUR), fix(NOW - 4 * HOUR, LIS.lat, east(5000)), fix(NOW - 3 * HOUR), fix(NOW - 2 * HOUR), fix(NOW - HOUR)]
    expect(stintStart(fixes, fix(NOW))).toBe(NOW - 3 * HOUR)
    expect(stintStart([], fix(NOW))).toBe(NOW)
  })
  it('absenceDays is the gap between the last earlier visit nearby and the stint', () => {
    const start = NOW - 2 * HOUR
    expect(absenceDays([dayAt(212), dayAt(0)], fix(NOW), start)).toBe(212)
    expect(absenceDays([dayAt(300), dayAt(212, LIS.lat, east(3000))], fix(NOW), start)).toBe(300)
  })
  it('absenceDays is null when never here before', () => {
    expect(absenceDays([dayAt(212, LIS.lat, east(3000)), dayAt(0)], fix(NOW), NOW - HOUR)).toBeNull()
    expect(absenceDays([], fix(NOW), NOW)).toBeNull()
  })
})

describe('newcomerAbsence and eligible', () => {
  it('the later arriver is the newcomer; null is infinite', () => {
    expect(newcomerAbsence(side({ absenceDays: 200, fix: fix(NOW - HOUR) }), side({ absenceDays: 3, fix: fix(NOW - 60_000) }))).toBe(3)
    expect(newcomerAbsence(side({ absenceDays: 3, fix: fix(NOW - 60_000) }), side({ absenceDays: 200, fix: fix(NOW - HOUR) }))).toBe(3)
    expect(newcomerAbsence(side({ absenceDays: null, fix: fix(NOW) }), side({ absenceDays: 200, fix: fix(NOW - HOUR) }))).toBe(Infinity)
  })
  it('both fresh, near, non-habitat, absence 200 → eligible', () => expect(eligible(side(), side(), NOW)).toBe(true))
  it('me habitat → not eligible', () => expect(eligible(side({ habitat: true }), side(), NOW)).toBe(false))
  it('friend habitat → not eligible', () => expect(eligible(side(), side({ habitat: true }), NOW)).toBe(false))
  it('newcomer absence 3 days → not eligible', () => expect(eligible(side({ absenceDays: 200, fix: fix(NOW - HOUR) }), side({ absenceDays: 3 }), NOW)).toBe(false))
  it('null absence (never here) → eligible', () => expect(eligible(side({ absenceDays: null }), side(), NOW)).toBe(true))
  it('stale fix 11 min → not eligible', () => expect(eligible(side(), side({ fix: fix(NOW - 11 * 60_000) }), NOW)).toBe(false))
  it('1700 m apart → not eligible', () => expect(eligible(side(), side({ fix: fix(NOW - 60_000, LIS.lat, east(1700)) }), NOW)).toBe(false))
})

describe('debounce and decide', () => {
  it('debounced within 24 h, free after', () => {
    const d = recordHit(none, PAIR, NOW - HOUR)
    expect(debounced(d, PAIR, NOW)).toBe(true)
    expect(debounced(d, PAIR, NOW + DEBOUNCE_MS)).toBe(false)
    expect(debounced(d, 'OTHER', NOW)).toBe(false)
    expect(none.lastHitByPair).toEqual({})
  })
  it('eligible → Fire with pairId:now', () => expect(decide(side(), side(), PAIR, NOW, none, null)).toEqual({ kind: 'fire', hitId: `${PAIR}:${NOW}` }))
  it('debounced → Quiet even when eligible', () => expect(decide(side(), side(), PAIR, NOW, recordHit(none, PAIR, NOW - HOUR), null)).toEqual({ kind: 'quiet' }))
  it('incoming hit → Echo even when not eligible', () => expect(decide(side({ habitat: true }), side(), PAIR, NOW, none, `${PAIR}:1`)).toEqual({ kind: 'echo', hitId: `${PAIR}:1` }))
  it('nothing → Quiet', () => expect(decide(side({ habitat: true }), side(), PAIR, NOW, none, null)).toEqual({ kind: 'quiet' }))
})
