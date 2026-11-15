import { bearing, type Segment } from '../analytics/position'
import type { Lens } from '../analytics/lens'

export type StampKind = Lens | 'still' | 'ff'

/** Legs shorter than this keep the glyph upright, so a short hop is still read as a car or a walker rather than a tilt. */
export const POINT_KM = 15
/** How long the glyph takes to swing onto a new heading. */
export const HEADING_EASE_MS = 350
/** A frame this long after the last one snaps instead of sweeping from where it was. */
const STALE_MS = 500

/**
 * Where the stamp points: one heading per leg, the great-circle bearing from its start to its end, so the glyph knows
 * a general direction without following every wobble of the trace. `null` means upright.
 */
export function stampHeading(seg: Segment | null, kind: StampKind): number | null {
  if (!seg || kind === 'still' || kind === 'ff' || seg.kind !== 'activity' || seg.km < POINT_KM) return null
  if (seg.s.lng === seg.e.lng && seg.s.lat === seg.e.lat) return null
  return bearing(seg.s, seg.e)
}

/** deck.gl icons turn counter-clockwise, so a compass heading (clockwise from north) is negated. */
export const iconAngle = (heading: number) => heading === 0 ? 0 : -heading

/** The shown heading, eased toward its target along the shortest arc; a lost heading eases back upright. */
export class HeadingEase {
  private shown = 0
  private last = 0
  private live = false
  at(want: number | null, tMs: number): number {
    const target = want ?? 0
    if (!this.live || tMs - this.last > STALE_MS) { this.shown = target; this.live = true }
    else {
      const k = Math.min(1, (tMs - this.last) / HEADING_EASE_MS)
      if (k >= 1) this.shown = target
      else {
        const d = ((target - this.shown + 540) % 360) - 180
        this.shown = (((this.shown + d * k) % 360) + 360) % 360
      }
    }
    this.last = tMs
    return this.shown
  }
}
