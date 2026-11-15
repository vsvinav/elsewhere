import { dragYear, stepYear, wheelState, yearSpan, yearsOf, type Span } from './yearWheel'

const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 1000
// A record from 2019-03-04 to 2025-11-15, the shared fixture for both platforms.
const record: Span = [utc(2019, 3, 4), utc(2025, 11, 15) + 86399]
const y2022: Span = [utc(2022, 1, 1), utc(2023, 1, 1) - 1]

describe('yearWheel', () => {
  it('lists every calendar year the record touches', () => {
    expect(yearsOf(record)).toEqual([2019, 2020, 2021, 2022, 2023, 2024, 2025])
    expect(yearsOf([utc(2024, 5, 1), utc(2024, 5, 2)])).toEqual([2024])
  })

  it('cuts a year span to the record at the ends', () => {
    expect(yearSpan(record, 2022)).toEqual(y2022)
    expect(yearSpan(record, 2019)).toEqual([record[0], utc(2020, 1, 1) - 1])
    expect(yearSpan(record, 2025)).toEqual([utc(2025, 1, 1), record[1]])
  })

  it('names the one year a selection covers, else null', () => {
    expect(wheelState(record, y2022)).toEqual({ year: 2022, all: false, from: y2022[0], to: y2022[1] })
    expect(wheelState(record, null)).toEqual({ year: null, all: true, from: record[0], to: record[1] })
    expect(wheelState(record, record).all).toBe(true)
    // A hand-picked window is neither a year nor the whole record.
    const custom = wheelState(record, [utc(2022, 1, 1), utc(2022, 6, 1)])
    expect(custom).toEqual({ year: null, all: false, from: utc(2022, 1, 1), to: utc(2022, 6, 1) })
    expect(wheelState(record, [record[1] - 90 * 86400, record[1]]).all).toBe(false)
    // The first and last years count whether or not the chip cut them to the record.
    expect(wheelState(record, [utc(2019, 1, 1), utc(2020, 1, 1) - 1]).year).toBe(2019)
    expect(wheelState(record, yearSpan(record, 2025)).year).toBe(2025)
  })

  it('steps a whole year at a time and stops at the record', () => {
    expect(stepYear(record, y2022, 1)).toEqual(yearSpan(record, 2023))
    expect(stepYear(record, y2022, -1)).toEqual(yearSpan(record, 2021))
    expect(stepYear(record, y2022, 0)).toEqual(y2022)
    expect(stepYear(record, yearSpan(record, 2025), 1)).toEqual(yearSpan(record, 2025))
    expect(stepYear(record, yearSpan(record, 2019), -1)).toEqual(yearSpan(record, 2019))
  })

  it('from all, forward goes to the first year and back to the last', () => {
    expect(stepYear(record, null, 1)).toEqual(yearSpan(record, 2019))
    expect(stepYear(record, null, -1)).toEqual(yearSpan(record, 2025))
    expect(stepYear(record, null, 0)).toEqual(record)
  })

  it('turns drag distance into a year, rounded and clamped', () => {
    expect(dragYear(record, 2022, 250)).toBe(2024)
    expect(dragYear(record, 2022, -250)).toBe(2020)
    expect(dragYear(record, 2022, 59)).toBe(2022)
    expect(dragYear(record, 2022, 60)).toBe(2023)
    expect(dragYear(record, 2022, -1000)).toBe(2019)
    expect(dragYear(record, 2022, 1000)).toBe(2025)
    expect(dragYear(record, null, -120)).toBe(2024)
    expect(dragYear(record, 2022, 500, 250)).toBe(2024)
  })
})
