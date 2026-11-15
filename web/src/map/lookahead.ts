import type { Data } from '../data/types'
import { segmentAt, type Segment } from '../analytics/position'
import { BIG_KM, screenSeconds } from './pace'

const MAX_STEPS = 400

export interface Upcoming { seg: Segment; /** real seconds until it starts on screen */ inS: number }

/** The first big leg that starts within `leadS` real seconds of screen time at this speed, walking segment by segment. Measured in screen time, not record time, so it is steady across slow and fast segments. */
export function upcomingBig(data: Data, now: number, speed: number, leadS: number): Upcoming | null {
  let seg = segmentAt(data, now)
  let inS = screenSeconds(seg, speed) * Math.max(0, Math.min(1, (seg.end - now) / Math.max(1, seg.end - seg.start)))
  for (let i = 0; i < MAX_STEPS && inS <= leadS; i++) {
    const nxt = segmentAt(data, seg.end + 2)
    if (nxt.start < seg.end) return null
    if (nxt.kind === 'activity' && nxt.km >= BIG_KM) return { seg: nxt, inS }
    inS += screenSeconds(nxt, speed)
    seg = nxt
  }
  return null
}
