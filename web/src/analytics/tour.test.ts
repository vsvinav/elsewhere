import { describe, expect, it } from 'vitest'
import { nightsIn } from './tour'

const T = (iso: string) => Date.parse(iso) / 1000

describe('nightsIn', () => {
  it('counts local 03:00 crossings', () => {
    // Boston (UTC-5): 20:00 → 09:00 next day spans one 03:00
    expect(nightsIn({ start: T('2025-01-10T01:00:00Z'), end: T('2025-01-10T14:00:00Z'), tz: -300 })).toBe(1)
    // a lunch stop sleeps nowhere
    expect(nightsIn({ start: T('2025-01-10T17:00:00Z'), end: T('2025-01-10T19:00:00Z'), tz: -300 })).toBe(0)
    // three nights in Indore (UTC+5:30)
    expect(nightsIn({ start: T('2025-12-20T12:00:00Z'), end: T('2025-12-23T12:00:00Z'), tz: 330 })).toBe(3)
  })
})
