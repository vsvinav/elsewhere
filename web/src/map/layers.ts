import { PathLayer, ScatterplotLayer, TextLayer, TripsLayer, type Layer } from 'deck.gl'
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
interface Dot extends Place { id: string; title: string }

// TripsLayer keeps timestamps in float32; offset by t0 to keep precision.
export function buildTrails(data: Data, t0: number): Trail[] {
  const trails: Trail[] = []
  for (const p of data.paths) if (p.pts.length > 1) trails.push({ path: p.pts.map(([, lat, lng]) => [lng, lat]), ts: p.pts.map(([ts]) => ts - t0), color: STOCK })
  for (const a of data.activities) trails.push({ path: [[a.s_lng, a.s_lat], [a.e_lng, a.e_lat]], ts: [a.start - t0, a.end - t0], color: a.mode === 'FLYING' ? ORANGE : STOCK })
  return trails
}

let cache: { data: Data; trails: Trail[]; dots: Dot[]; labels: Map<number, Dot[]> } | null = null
function prepared(data: Data) {
  if (cache?.data !== data) {
    const dots: Dot[] = Object.entries(data.places).filter(([, p]) => p.semantic_type !== 'INFERRED_HOME' && p.n_visits >= 2)
      .map(([id, p]) => ({ ...p, id, title: (p.name ?? p.label ?? '').trim() })).sort((a, b) => b.n_visits - a.n_visits)
    cache = { data, trails: buildTrails(data, data.meta.range[0]), dots, labels: new Map() }
  }
  return cache
}

/** Greedy screen-space culling: most-visited label wins its box; nothing below zoom 6. */
function labelDots(dots: Dot[], zoom: number): Dot[] {
  if (zoom < 6) return []
  const scale = (256 * 2 ** zoom) / 360
  const px = (d: Dot) => {
    const y = Math.log(Math.tan(Math.PI / 4 + (d.lat * Math.PI) / 360)) * (180 / Math.PI)
    return [(d.lng + 180) * scale + 12, (180 - y) * scale - 8]
  }
  const kept: number[][] = [], out: Dot[] = []
  for (const d of dots) {
    if (!d.title) continue
    const [x, y] = px(d), w = d.title.length * 7.2 + 24, h = 22
    if (kept.some(([kx, ky, kw, kh]) => x < kx + kw && x + w > kx && y < ky + kh && y + h > ky)) continue
    kept.push([x, y, w, h]); out.push(d)
  }
  return out
}

export function mapLayers(data: Data, now: number, rate: number, playing: boolean, basemap: 'dark' | 'light' = 'dark', reveal = now, zoom = 10): Layer[] {
  const { trails, dots, labels } = prepared(data)
  const zb = Math.floor(zoom * 2) / 2
  let labelled = labels.get(zb)
  if (!labelled) labels.set(zb, (labelled = labelDots(dots, zb)))
  const paper = basemap === 'dark' ? STOCK : INK
  const tint = (c: RGBA): RGBA => (c === STOCK ? paper : c)
  const t0 = data.meta.range[0]
  const layers: Layer[] = []
  if (!playing) {
    // Paused: the whole record as hairlines, like the strip printed on the pass.
    layers.push(new PathLayer<Trail>({ id: 'record', data: trails, getPath: (d) => d.path, getColor: (d) => { const c = tint(d.color); return [c[0], c[1], c[2], d.color === ORANGE ? 90 : 55] }, widthMinPixels: 1, widthMaxPixels: 2, opacity: 1 }))
  }
  const trail = (id: string, length: number, color: (d: Trail) => RGBA, width: number, opacity: number) => new TripsLayer<Trail>({
    id, data: trails, getPath: (d) => d.path, getTimestamps: (d) => d.ts, getColor: color, updateTriggers: { getColor: [basemap] },
    currentTime: now - t0, trailLength: length, fadeTrail: true, widthMinPixels: width, widthMaxPixels: width * 2, capRounded: true, jointRounded: true, opacity,
  })
  const headLen = HEAD_REAL_S * rate
  layers.push(
    // Week-long wake, then a three-layer head: wide glow, orange core, hot ember centre.
    trail('trail-long', LONG_TRAIL_S, (d) => tint(d.color), 2, playing ? 0.45 : 0.22),
    trail('trail-glow', headLen * 1.6, () => ORANGE, 18, 0.16),
    trail('trail-head', headLen, () => ORANGE, 5, 0.95),
    new ScatterplotLayer<Dot>({
      id: 'places', data: dots, pickable: true,
      getPosition: (d) => [d.lng, d.lat],
      getRadius: (d) => 20 + Math.sqrt(d.n_visits) * 12, radiusMinPixels: 2, radiusMaxPixels: 16,
      getFillColor: (d) => { const c = basemap === 'dark' ? BLUE : [10, 42, 107]; return [c[0], c[1], c[2], d.first_ts <= reveal ? 150 : 0] },
      stroked: true, getLineColor: (d) => [paper[0], paper[1], paper[2], d.first_ts <= reveal ? 220 : 0], lineWidthMinPixels: 1.5,
      updateTriggers: { getFillColor: [Math.floor(reveal / 3600), basemap], getLineColor: [Math.floor(reveal / 3600), basemap] },
    }),
    new TextLayer<Dot>({
      id: 'labels', data: labelled,
      getPosition: (d) => [d.lng, d.lat], getText: (d) => d.title.toUpperCase(),
      getColor: (d) => [paper[0], paper[1], paper[2], d.first_ts <= reveal ? 235 : 0],
      getSize: 11, fontFamily: 'Barlow, sans-serif', fontWeight: 600, characterSet: 'auto', fontSettings: { sdf: true, buffer: 4 },
      outlineWidth: 4, outlineColor: basemap === 'dark' ? [15, 16, 22, 230] : [247, 246, 242, 230],
      getTextAnchor: 'start', getAlignmentBaseline: 'center', getPixelOffset: [12, 0],
      updateTriggers: { getColor: [Math.floor(reveal / 3600), basemap] },
    }),
  )
  const here = positionAt(data, now)
  if (here) layers.push(
    new ScatterplotLayer<{ lng: number; lat: number }>({
      id: 'here-glow', data: [here], getPosition: (d) => [d.lng, d.lat], getRadius: 1, radiusMinPixels: 22, radiusMaxPixels: 22,
      getFillColor: [ORANGE[0], ORANGE[1], ORANGE[2], 60], stroked: false,
    }),
    new ScatterplotLayer<{ lng: number; lat: number }>({
      id: 'here', data: [here], getPosition: (d) => [d.lng, d.lat], getRadius: 1, radiusMinPixels: 7, radiusMaxPixels: 7,
      getFillColor: ORANGE, stroked: true, getLineColor: paper, lineWidthMinPixels: 2.5, updateTriggers: { getLineColor: [basemap] },
    }),
  )
  return layers
}
