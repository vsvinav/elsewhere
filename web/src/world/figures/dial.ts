/** Geometry for the clock figure: a conventional 12-hour face with 12 at the top, read clockwise. Angles are in degrees, 0 pointing right, −90 straight up. */

export type Meridiem = 'AM' | 'PM'
export type DialGeometry = {
  ticks: { hour: number; angle: number; big: boolean }[]
  labels: { text: string; angle: number }[]
  hand: { angle: number; meridiem: Meridiem }
  /** One bar per non-empty hour; `len` is the share of the busiest hour. Morning hours sit on the inner ring, afternoon and evening on the outer. */
  bars: { hour: number; ring: 'am' | 'pm'; angle: number; len: number }[]
  /** Clockwise sweep from `from`; a window of 12 h or more becomes a full circle. */
  arc?: { from: number; sweep: number; full: boolean }
}

const mod = (x: number, m: number) => ((x % m) + m) % m

/** Where an hour (fractional, any day) sits on a 12-hour face. */
export const dialAngle = (hour: number) => (mod(hour, 12) / 12) * 360 - 90

export const meridiemOf = (hour: number): Meridiem => (mod(hour, 24) < 12 ? 'AM' : 'PM')

export function dialGeometry(hours: number[], hand: number, arc?: [number, number]): DialGeometry {
  const max = Math.max(1, ...hours)
  const ticks = Array.from({ length: 12 }, (_, i) => ({ hour: i === 0 ? 12 : i, angle: dialAngle(i), big: i % 3 === 0 }))
  const labels = [12, 3, 6, 9].map((h) => ({ text: String(h), angle: dialAngle(h) }))
  const bars = hours.flatMap((v, h) => (v > 0 ? [{ hour: h, ring: h % 24 < 12 ? ('am' as const) : ('pm' as const), angle: dialAngle(h + 0.5), len: v / max }] : []))
  let arcOut: DialGeometry['arc']
  if (arc) {
    // A window given as 23 → 7 wraps past midnight; one given as 22 → 28 already runs forward.
    const span = arc[1] >= arc[0] ? arc[1] - arc[0] : arc[1] - arc[0] + 24
    const full = span >= 12
    arcOut = { from: dialAngle(arc[0]), sweep: full ? 360 : (span / 12) * 360, full }
  }
  return { ticks, labels, hand: { angle: dialAngle(hand), meridiem: meridiemOf(hand) }, bars, arc: arcOut }
}
