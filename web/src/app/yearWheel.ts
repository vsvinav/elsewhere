export type Span = [number, number]

const yearOf = (ts: number) => new Date(ts * 1000).getUTCFullYear()

/** Every calendar year (UTC, the record's day convention) the record touches, first to last. */
export function yearsOf(range: Span): number[] {
  const out: number[] = []
  for (let y = yearOf(range[0]); y <= yearOf(range[1]); y++) out.push(y)
  return out
}

/** The whole-year window for `y`, cut to the record: what a year chip selects. */
export function yearSpan(range: Span, y: number): Span {
  return [Math.max(range[0], Date.UTC(y, 0, 1) / 1000), Math.min(range[1], Date.UTC(y + 1, 0, 1) / 1000 - 1)]
}

export interface WheelState { year: number | null; from: number; to: number }

/** The one year `selected` covers exactly, or `null` for the whole record or a custom window. */
export function wheelState(range: Span, selected: Span | null): WheelState {
  const sel: Span = selected ? [Math.max(range[0], selected[0]), Math.min(range[1], selected[1])] : range
  const y = yearOf(sel[0])
  const [a, b] = yearSpan(range, y)
  const year = sel[0] === a && sel[1] === b && yearOf(sel[1]) === y ? y : null
  return { year, from: sel[0], to: sel[1] }
}

const clampYear = (range: Span, y: number) => Math.min(yearOf(range[1]), Math.max(yearOf(range[0]), y))

/** The neighbouring whole year, clamped to the record; from "all", `+1` lands on the first year and `-1` on the last. */
export function stepYear(range: Span, selected: Span | null, delta: -1 | 0 | 1): Span {
  const { year } = wheelState(range, selected)
  if (year === null) return delta === 0 ? range : yearSpan(range, delta > 0 ? yearOf(range[0]) : yearOf(range[1]))
  return yearSpan(range, clampYear(range, year + delta))
}

/** The year under the finger after dragging `dxPx` from `startYear`; `null` starts from the last year. */
export function dragYear(range: Span, startYear: number | null, dxPx: number, pxPerYear = 120): number {
  return clampYear(range, (startYear ?? yearOf(range[1])) + Math.round(dxPx / pxPerYear))
}
