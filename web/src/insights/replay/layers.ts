import { ScatterplotLayer, TripsLayer, type Layer } from 'deck.gl'
import type { Data, Visit } from '../../data/types'
import type { Store } from '../../store/useStore'
import { modeColor, PATH_COLOR, VISIT_COLOR, type RGBA } from './colors'

interface Trail { path: [number, number][]; ts: number[]; color: RGBA }

/** Trail length in seconds per replay speed (1x = 1 h/s of real time). */
export const TRAIL_SECONDS: Record<number, number> = { 1: 3 * 3600, 10: 18 * 3600, 100: 4 * 86400 }

// TripsLayer stores timestamps as float32; offset epoch seconds by t0 to keep precision.
export function buildTrails(data: Data, t0: number): Trail[] {
  const trails: Trail[] = []
  for (const p of data.paths) {
    if (p.pts.length < 2) continue
    trails.push({
      path: p.pts.map(([, lat, lng]) => [lng, lat]),
      ts: p.pts.map(([ts]) => ts - t0),
      color: PATH_COLOR,
    })
  }
  for (const a of data.activities) {
    trails.push({
      path: [[a.s_lng, a.s_lat], [a.e_lng, a.e_lat]],
      ts: [a.start - t0, a.end - t0],
      color: modeColor(a.mode),
    })
  }
  return trails
}

let trailCache: { data: Data; t0: number; trails: Trail[] } | null = null
function trailsFor(data: Data, t0: number): Trail[] {
  if (!trailCache || trailCache.data !== data || trailCache.t0 !== t0) {
    trailCache = { data, t0, trails: buildTrails(data, t0) }
  }
  return trailCache.trails
}

export function replayLayers(data: Data, state: Store): Layer[] {
  const [r0, r1] = state.timeRange
  const now = state.playhead ?? r1
  const trail = TRAIL_SECONDS[state.speed]

  const visits = data.visits.filter((v) => v.lvl === 0 && v.start >= r0 && v.start <= now)
  const fade = trail * 4

  return [
    new TripsLayer<Trail>({
      id: 'replay-trails',
      data: trailsFor(data, r0),
      getPath: (d) => d.path,
      getTimestamps: (d) => d.ts,
      getColor: (d) => d.color,
      currentTime: now - r0,
      trailLength: trail,
      fadeTrail: true,
      widthMinPixels: 2,
      capRounded: true,
      jointRounded: true,
      opacity: 0.9,
    }),
    new ScatterplotLayer<Visit>({
      id: 'replay-visits',
      data: visits,
      getPosition: (v) => [v.lng, v.lat],
      getRadius: (v) => (now >= v.start && now <= v.end + trail ? 60 : 25),
      radiusMinPixels: 2,
      radiusMaxPixels: 14,
      getFillColor: (v) => {
        const age = now - v.end
        const a = age <= 0 ? 255 : Math.max(50, 255 - (age / fade) * 205)
        return [VISIT_COLOR[0], VISIT_COLOR[1], VISIT_COLOR[2], a]
      },
      stroked: false,
      pickable: true,
      updateTriggers: { getRadius: [now], getFillColor: [now] },
    }),
  ]
}
