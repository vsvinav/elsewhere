import type { Segment } from '../analytics/position'

const GAP_RATE = 6 * 3600
/** Legs longer than this are "big": they keep screen time at any speed and the camera opens up before them. */
export const BIG_KM = 150

/** Real seconds a segment should take on screen at pace 1: legs 2.5–7 s by distance, stays 0.6–2.5 s by length. */
export function realSeconds(seg: Segment): number {
  if (seg.kind === 'activity') return Math.min(7, Math.max(2.5, 2 + Math.log2(1 + seg.km) * 0.6))
  if (seg.kind === 'visit') return Math.min(2.5, Math.max(0.6, 0.6 + ((seg.end - seg.start) / 3600) * 0.2))
  return (seg.end - seg.start) / GAP_RATE
}

/** Screen time a segment gets at a speed: everything shrinks with speed except big legs, which keep 1.2–4.5 s by distance so a flight is never a flash. */
export function screenSeconds(seg: Segment, speed: number): number {
  const base = realSeconds(seg) / Math.max(1e-6, speed)
  if (seg.kind !== 'activity' || seg.km < BIG_KM) return base
  return Math.max(base, Math.min(4.5, 1.2 + Math.log2(seg.km / BIG_KM) * 0.75))
}
