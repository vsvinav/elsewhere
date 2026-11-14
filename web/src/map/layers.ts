import { PathLayer, ScatterplotLayer, TripsLayer, type Layer } from 'deck.gl'
import type { Data, Place } from '../data/types'
import { positionAt } from '../analytics/position'

type RGBA = [number, number, number, number]
const STOCK: RGBA = [247, 246, 242, 255]
const INK: RGBA = [17, 17, 17, 255]
const ORANGE: RGBA = [255, 90, 31, 255]
const BLUE: RGBA = [159, 179, 230, 255]
export const LONG_TRAIL_S = 7 * 86400
const HEAD_REAL_S = 4

interface Trail { path: [number, number][]; ts: number[]; color: RGBA }
interface Dot extends Place { id: string }

// TripsLayer keeps timestamps in float32; offset by t0 to keep precision.
export function buildTrails(data: Data, t0: number): Trail[] {
  const trails: Trail[] = []
  for (const p of data.paths) if (p.pts.length > 1) trails.push({ path: p.pts.map(([, lat, lng]) => [lng, lat]), ts: p.pts.map(([ts]) => ts - t0), color: STOCK })
  for (const a of data.activities) trails.push({ path: [[a.s_lng, a.s_lat], [a.e_lng, a.e_lat]], ts: [a.start - t0, a.end - t0], color: a.mode === 'FLYING' ? ORANGE : STOCK })
  return trails
}

let cache: { data: Data; trails: Trail[]; dots: Dot[] } | null = null
function prepared(data: Data) {
  if (cache?.data !== data) {
    const dots = Object.entries(data.places).filter(([, p]) => p.semantic_type !== 'INFERRED_HOME' && p.n_visits >= 2).map(([id, p]) => ({ ...p, id }))
    cache = { data, trails: buildTrails(data, data.meta.range[0]), dots }
  }
  return cache
}

export function mapLayers(data: Data, now: number, speed: number, playing: boolean, basemap: 'dark' | 'light' = 'dark'): Layer[] {
  const { trails, dots } = prepared(data)
  const paper = basemap === 'dark' ? STOCK : INK
  const tint = (c: RGBA): RGBA => (c === STOCK ? paper : c)
  const t0 = data.meta.range[0]
  const layers: Layer[] = []
  if (!playing) {
    // Paused: the whole record as hairlines, like the strip printed on the pass.
    layers.push(new PathLayer<Trail>({ id: 'record', data: trails, getPath: (d) => d.path, getColor: (d) => { const c = tint(d.color); return [c[0], c[1], c[2], d.color === ORANGE ? 90 : 55] }, widthMinPixels: 1, widthMaxPixels: 2, opacity: 1 }))
  }
  layers.push(
    new TripsLayer<Trail>({
      id: 'trail-long', data: trails, getPath: (d) => d.path, getTimestamps: (d) => d.ts, getColor: (d) => tint(d.color), updateTriggers: { getColor: [basemap] },
      currentTime: now - t0, trailLength: LONG_TRAIL_S, fadeTrail: true, widthMinPixels: 2, capRounded: true, jointRounded: true, opacity: playing ? 0.55 : 0.25,
    }),
    new TripsLayer<Trail>({
      id: 'trail-head', data: trails, getPath: (d) => d.path, getTimestamps: (d) => d.ts, getColor: () => ORANGE,
      currentTime: now - t0, trailLength: HEAD_REAL_S * speed, fadeTrail: true, widthMinPixels: 4, capRounded: true, jointRounded: true, opacity: 0.95,
    }),
    new ScatterplotLayer<Dot>({
      id: 'places', data: dots, pickable: true,
      getPosition: (d) => [d.lng, d.lat],
      getRadius: (d) => 20 + Math.sqrt(d.n_visits) * 12, radiusMinPixels: 2, radiusMaxPixels: 16,
      getFillColor: (d) => { const c = basemap === 'dark' ? BLUE : [10, 42, 107]; return [c[0], c[1], c[2], d.first_ts <= now ? 200 : 0] },
      stroked: false, updateTriggers: { getFillColor: [Math.floor(now / 3600), basemap] },
    }),
  )
  const here = positionAt(data, now)
  if (here) layers.push(new ScatterplotLayer<{ lng: number; lat: number }>({
    id: 'here', data: [here], getPosition: (d) => [d.lng, d.lat], getRadius: 1, radiusMinPixels: 7, radiusMaxPixels: 7,
    getFillColor: ORANGE, stroked: true, getLineColor: paper, lineWidthMinPixels: 2.5, updateTriggers: { getLineColor: [basemap] },
  }))
  return layers
}
