import type { Segment } from '../analytics/position'

const GAP_RATE = 6 * 3600

/** Real seconds a segment should take on screen at pace 1: legs 2.5–7 s by distance, stays 0.6–2.5 s by length. */
export function realSeconds(seg: Segment): number {
  if (seg.kind === 'activity') return Math.min(7, Math.max(2.5, 2 + Math.log2(1 + seg.km) * 0.6))
  if (seg.kind === 'visit') return Math.min(2.5, Math.max(0.6, 0.6 + ((seg.end - seg.start) / 3600) * 0.2))
  return (seg.end - seg.start) / GAP_RATE
}
