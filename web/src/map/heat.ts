import type { Place } from '../data/types'

type RGBA = [number, number, number, number]

/** Cold to hot, evenly spaced: the heat view never borrows the poster red that elsewhere means new or seldom visited. */
export const HEAT_STOPS: RGBA[] = [
  [43, 75, 209, 0],      // 0.00 transparent blue
  [43, 75, 209, 160],    // 0.20 blue
  [47, 191, 113, 200],   // 0.40 green
  [242, 225, 76, 230],   // 0.60 yellow
  [240, 128, 32, 245],   // 0.80 orange
  [214, 60, 32, 255],    // 1.00 red
]
export const HEAT_RADIUS_PX = 40
export const HEAT_INTENSITY = 1
export const HEAT_THRESHOLD = 0.05

/** Colour at `t` in [0, 1], piecewise-linear between the stops; out-of-range values clamp. */
export function heatColor(t: number): RGBA {
  const n = HEAT_STOPS.length - 1
  const x = Math.min(1, Math.max(0, t)) * n
  const i = Math.min(n - 1, Math.floor(x))
  const f = x - i
  const a = HEAT_STOPS[i], b = HEAT_STOPS[i + 1]
  return [0, 1, 2, 3].map((k) => Math.round(a[k] + (b[k] - a[k]) * f)) as RGBA
}

/** "Where we go most often": a stop weighs its visit count. */
export function heatWeight(d: Pick<Place, 'n_visits'>): number {
  return d.n_visits
}

/** The legend bar's gradient, one stop per palette entry. */
export function heatCss(): string {
  const n = HEAT_STOPS.length - 1
  const stops = HEAT_STOPS.map(([r, g, b, a], i) => `rgba(${r}, ${g}, ${b}, ${+(a / 255).toFixed(3)}) ${Math.round((i / n) * 100)}%`)
  return `linear-gradient(90deg, ${stops.join(', ')})`
}
