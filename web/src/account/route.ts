// The welcome sketch: a fixed demo route from HOME to five far pins, drawn once over 6.4 s while a numeral counts the
// kilometres. Pure timing lives here so the component only has to paint.

export const POINTS = [
  { x: 0.12, y: 0.78, label: 'HOME', km: 0 },
  { x: 0.23, y: 0.62, label: 'BOSTON', km: 420 },
  { x: 0.41, y: 0.36, label: 'REYKJAVÍK', km: 4260 },
  { x: 0.57, y: 0.47, label: 'LISBON', km: 7210 },
  { x: 0.74, y: 0.30, label: 'ISTANBUL', km: 10390 },
  { x: 0.90, y: 0.58, label: 'NAIROBI', km: 14920 },
]
/** Three hand-set bends per leg; the wobble is authored, never randomised. */
export const WOBBLE: [number, number][][] = [
  [[0.15, 0.74], [0.18, 0.69], [0.21, 0.64]],
  [[0.27, 0.55], [0.33, 0.46], [0.37, 0.40]],
  [[0.46, 0.39], [0.50, 0.44], [0.54, 0.46]],
  [[0.62, 0.42], [0.66, 0.36], [0.70, 0.32]],
  [[0.79, 0.36], [0.84, 0.46], [0.88, 0.54]],
]

export const W = 400
export const H = 300
export const HOLD = 400
export const LEG = 1200
export const LEGS = POINTS.length - 1
export const TOTAL = HOLD + LEG * LEGS

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const r = (v: number) => Math.round(v * 10) / 10
const px = (p: [number, number] | { x: number; y: number }) => (Array.isArray(p) ? `${r(p[0] * W)} ${r(p[1] * H)}` : `${r(p.x * W)} ${r(p.y * H)}`)

/** The route as straight segments on the 400×300 sheet. */
export function pathD(): string {
  const parts = [`M${px(POINTS[0])}`]
  for (let i = 0; i < LEGS; i++) { for (const w of WOBBLE[i]) parts.push(`L${px(w)}`); parts.push(`L${px(POINTS[i + 1])}`) }
  return parts.join(' ')
}

/** Cumulative route length to each pin on the sheet, measured from the geometry so the draw needs no DOM. */
export const LEG_END: number[] = (() => {
  const out = [0]
  let prev: [number, number] = [POINTS[0].x, POINTS[0].y], len = 0
  for (let i = 0; i < LEGS; i++) {
    for (const p of [...WOBBLE[i], [POINTS[i + 1].x, POINTS[i + 1].y] as [number, number]]) { len += Math.hypot((p[0] - prev[0]) * W, (p[1] - prev[1]) * H); prev = p }
    out.push(len)
  }
  return out
})()
export const PATH_LENGTH = LEG_END[LEGS]

export interface Frame {
  /** 0 during the hold, 1..5 while a leg is in flight, 6 once the route is done. */
  leg: number
  /** Fraction of the whole path drawn; the pen reaches pin i exactly as leg i ends. */
  progress: number
  km: number
  /** Far pins the route has reached. */
  stamps: number
}

export function sketchAt(t: number): Frame {
  if (t < HOLD) return { leg: 0, progress: 0, km: 0, stamps: 0 }
  if (t >= TOTAL) return { leg: LEGS + 1, progress: 1, km: POINTS[LEGS].km, stamps: LEGS }
  const i = Math.floor((t - HOLD) / LEG)
  const e = ease((t - HOLD - i * LEG) / LEG)
  const from = POINTS[i].km, to = POINTS[i + 1].km
  return { leg: i + 1, progress: (LEG_END[i] + (LEG_END[i + 1] - LEG_END[i]) * e) / PATH_LENGTH, km: Math.round(from + (to - from) * e), stamps: i }
}
