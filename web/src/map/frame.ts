import type { LngLat } from '../analytics/position'
import type { Segment } from '../analytics/position'
import { fitZoom } from './camera'
import { realSeconds } from './pace'

export interface Frame { center: LngLat; zoom: number }
const STAY_ZOOM = 14
const SHORT_STAY_S = 1.6
const LEAD_S = 1.4

const lerp = (a: LngLat, b: LngLat, t: number): LngLat => ({ lng: a.lng + (b.lng - a.lng) * t, lat: a.lat + (b.lat - a.lat) * t })
const mid = (s: Segment) => lerp(s.s, s.e, 0.5)
const legZoom = (s: Segment, w: number, h: number) => fitZoom(s.s, s.e, w * 0.72, h * 0.72)

/**
 * Where the replay camera should be: a frame that holds the whole leg while the dot crosses it,
 * drifting a third of the way with the dot so it never pins to an edge. Short stops between legs
 * keep the wide frame instead of diving into town; the last beat of a stay already opens up for
 * the next leg, so a take-off never surprises.
 */
export function frameFor(seg: Segment, next: Segment | null, here: LngLat, now: number, rate: number, w: number, h: number): Frame {
  if (seg.kind === 'visit') {
    const total = realSeconds(seg), left = Math.max(0, (seg.end - now) / Math.max(1, rate))
    const leg = next && next.kind !== 'visit' && next.km > 2 ? next : null
    if (leg && (total < SHORT_STAY_S || left < LEAD_S)) {
      // Open the next leg's frame, easing its centre in from where we stand.
      const k = total < SHORT_STAY_S ? 0.5 : 1 - left / LEAD_S
      return { center: lerp(here, mid(leg), 0.35 * k), zoom: Math.max(3, legZoom(leg, w, h) + (1 - k) * 2) }
    }
    return { center: here, zoom: STAY_ZOOM }
  }
  const span = Math.max(1, seg.end - seg.start), prog = Math.min(1, Math.max(0, (now - seg.start) / span))
  const z = Math.max(3, Math.min(STAY_ZOOM + 1.5, legZoom(seg, w, h)))
  // Frame the leg; let the dot pull the centre a third of the way so it reads as travel, and land on the destination.
  const pull = prog > 0.85 ? 0.35 + ((prog - 0.85) / 0.15) * 0.65 : 0.35
  return { center: lerp(mid(seg), here, pull), zoom: z }
}
