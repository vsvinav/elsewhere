import type { LngLat } from '../analytics/position'
import type { Segment } from '../analytics/position'
import type { Data } from '../data/types'
import type { Grain } from '../analytics/timeline'
import { boundsOf, type Bounds } from '../analytics/geo'
export type { Bounds }
import { fitZoom } from './camera'
import { realSeconds } from './pace'
import { tripArcs } from './layers'

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

/**
 * What a coarser grain should hold in frame at `now`: the year shows the trip under the playhead, or every trip when
 * none is; the month shows that calendar month's stops. The day frames nothing extra (the follow-cam already does).
 */
export function grainBounds(data: Data, grain: Grain, now: number): Bounds | null {
  if (grain === 'year') {
    const cur = data.trips.find((t) => t.start <= now && now <= t.end)
    const arcs = cur ? tripArcs({ ...data, trips: [cur] }) : tripArcs(data)
    return boundsOf(arcs.flatMap((a) => a.path.map(([lng, lat]) => ({ lng, lat }))))
  }
  if (grain === 'month') {
    const [a, b] = monthOf(now)
    return boundsOf(data.visits.filter((v) => v.lvl === 0 && v.end >= a && v.start < b))
  }
  return null
}

/** The UTC calendar month holding `now`, as [start, end) seconds; the HUD and the frame both read the month from here. */
export function monthOf(now: number): [number, number] {
  const d = new Date(now * 1000)
  return [Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000, Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000]
}

/** Changes exactly when `grainBounds` would: the trip under the playhead, or the calendar month. */
export function grainKey(data: Data, grain: Grain, now: number): string {
  if (grain === 'year') return `year:${data.trips.find((t) => t.start <= now && now <= t.end)?.start ?? 'all'}`
  if (grain === 'month') { const d = new Date(now * 1000); return `month:${d.getUTCFullYear()}-${d.getUTCMonth()}` }
  return 'day'
}

/** The frame that holds `b` in the middle of a viewport of the given size. */
export function frameOf(b: Bounds, w: number, h: number): Frame {
  return { center: { lng: (b[0][0] + b[1][0]) / 2, lat: (b[0][1] + b[1][1]) / 2 }, zoom: Math.max(2, Math.min(14, fitZoom({ lng: b[0][0], lat: b[0][1] }, { lng: b[1][0], lat: b[1][1] }, w, h, 0.7))) }
}
