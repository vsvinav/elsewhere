import type { Data } from '../data/types'
import { lensOf, type Lens } from './lens'

/** One drawn line per activity, in absolute seconds: the GPS points inside it, pinned to the leg's own start and end. */
export interface Leg { path: [number, number][]; ts: number[]; mode: string; lens: Lens; /** no GPS points: a straight guess between the two places */ guessed: boolean }

/** Points along the great circle from a to b, so a flight bends the way it was flown instead of cutting straight across. */
export function greatCircle(a: [number, number], b: [number, number], n: number): [number, number][] {
  const r = Math.PI / 180
  const [l1, f1, l2, f2] = [a[0] * r, a[1] * r, b[0] * r, b[1] * r]
  const d = 2 * Math.asin(Math.sqrt(Math.sin((f2 - f1) / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin((l2 - l1) / 2) ** 2))
  if (d < 1e-9) return [a, b]
  const out: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d)
    const x = A * Math.cos(f1) * Math.cos(l1) + B * Math.cos(f2) * Math.cos(l2)
    const y = A * Math.cos(f1) * Math.sin(l1) + B * Math.cos(f2) * Math.sin(l2)
    const z = A * Math.sin(f1) + B * Math.sin(f2)
    out.push([Math.atan2(y, x) / r, Math.atan2(z, Math.hypot(x, y)) / r])
  }
  return out
}

const LEGS = new WeakMap<Data['activities'], { paths: Data['paths']; legs: Leg[] }>()

/** legs[i] belongs to data.activities[i]. Path points outside every activity (jitter during a stay) are dropped. */
export function legsOf(data: Data): Leg[] {
  const hit = LEGS.get(data.activities)
  if (hit && hit.paths === data.paths) return hit.legs
  const acts = data.activities, paths = data.paths ?? []
  const legs: Leg[] = []
  let pi = 0
  for (const a of acts) {
    const path: [number, number][] = [[a.s_lng, a.s_lat]], ts = [a.start]
    while (pi < paths.length && paths[pi].end < a.start) pi++
    for (let j = pi; j < paths.length && paths[j].start <= a.end; j++) {
      for (const [t, lat, lng] of paths[j].pts) if (t > a.start && t < a.end) { path.push([lng, lat]); ts.push(t) }
    }
    const lens = lensOf(a.mode)
    if (path.length === 1 && lens === 'fly' && a.m > 80_000) {
      const arc = greatCircle([a.s_lng, a.s_lat], [a.e_lng, a.e_lat], 48)
      legs.push({ path: arc, ts: arc.map((_, i) => a.start + ((a.end - a.start) * i) / (arc.length - 1)), mode: a.mode, lens, guessed: false })
      continue
    }
    const guessed = path.length === 1
    path.push([a.e_lng, a.e_lat]); ts.push(Math.max(a.end, ts[ts.length - 1] + 1))
    legs.push({ path, ts, mode: a.mode, lens, guessed })
  }
  LEGS.set(data.activities, { paths: data.paths, legs })
  return legs
}
