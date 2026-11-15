import type { Data } from '../data/types'
import { segmentAt, type Segment } from '../analytics/position'
import { BIG_KM } from './pace'

const MAX_STEPS = 400

/** The first big leg starting in (from, until], walking segment by segment; null if none is that close. */
export function upcomingBig(data: Data, from: number, until: number): Segment | null {
  let t = from
  for (let i = 0; i < MAX_STEPS && t < until; i++) {
    const seg = segmentAt(data, t + 2)
    if (seg.start > until) return null
    if (seg.kind === 'activity' && seg.km >= BIG_KM && seg.start > from) return seg
    if (seg.end <= t) return null
    t = seg.end
  }
  return null
}
