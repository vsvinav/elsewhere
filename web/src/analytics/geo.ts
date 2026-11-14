import type { LngLat } from './position'

export type Bounds = [[number, number], [number, number]]

export function boundsOf(pts: LngLat[]): Bounds | null {
  if (!pts.length) return null
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of pts) { x0 = Math.min(x0, p.lng); y0 = Math.min(y0, p.lat); x1 = Math.max(x1, p.lng); y1 = Math.max(y1, p.lat) }
  return [[x0, y0], [x1, y1]]
}

export const isHome = (p: { role: 'home' | 'work' | null } | undefined) => p?.role === 'home'
export const isWork = (p: { role: 'home' | 'work' | null } | undefined) => p?.role === 'work'

/** Bounds of the dense part of a record (5th–95th percentile), so flights do not shrink daily life to a dot. */
export function denseBounds(pts: LngLat[]): Bounds | null {
  if (!pts.length) return null
  const q = (vals: number[], p: number) => vals.sort((a, b) => a - b)[Math.floor(p * (vals.length - 1))]
  const xs = pts.map((p) => p.lng), ys = pts.map((p) => p.lat)
  return [[q(xs, 0.05), q(ys, 0.05)], [q(xs, 0.95), q(ys, 0.95)]]
}
