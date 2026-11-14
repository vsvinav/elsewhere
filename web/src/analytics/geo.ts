import type { LngLat } from './position'

export type Bounds = [[number, number], [number, number]]

export function boundsOf(pts: LngLat[]): Bounds | null {
  if (!pts.length) return null
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of pts) { x0 = Math.min(x0, p.lng); y0 = Math.min(y0, p.lat); x1 = Math.max(x1, p.lng); y1 = Math.max(y1, p.lat) }
  return [[x0, y0], [x1, y1]]
}

export function isHome(type: string): boolean { return type === 'INFERRED_HOME' }
export function isWork(type: string): boolean { return type === 'INFERRED_WORK' || type === 'WORK' }
