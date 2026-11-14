import { PathLayer, ScatterplotLayer, TextLayer, TripsLayer, type Layer } from 'deck.gl'
import type { Data, Place } from '../data/types'
import { positionAt } from '../analytics/position'
import { lensOf, type Lens } from '../analytics/lens'

type RGBA = [number, number, number, number]
const STOCK: RGBA = [239, 230, 210, 255]
const INK: RGBA = [20, 20, 20, 255]
const RED: RGBA = [214, 60, 32, 255]
const MUSTARD: RGBA = [233, 181, 49, 255]
const GREY: RGBA = [124, 118, 103, 255]
export const LONG_TRAIL_S = 7 * 86400
const HEAD_REAL_S = 4

interface Trail { path: [number, number][]; ts: number[]; color: RGBA; t0: number; t1: number; lens: Lens }
/** Ink per kind of movement: flights red, foot mustard, transit grey, drives black. */
const INK_OF: Record<Lens, RGBA> = { all: INK, fly: RED, drive: INK, transit: GREY, foot: MUSTARD }
interface Dot extends Place { id: string; title: string }

// TripsLayer keeps timestamps in float32; offset by t0 to keep precision.
export function buildTrails(data: Data, t0: number): Trail[] {
  const trails: Trail[] = []
  // A GPS path takes the lens of the activity it sits inside; paths are sorted by time, as are activities.
  const acts = data.activities
  let ai = 0
  for (const p of data.paths) if (p.pts.length > 1) {
    const ts = p.pts.map(([ts]) => ts - t0), mid = (p.start + p.end) / 2
    while (ai < acts.length && acts[ai].end < mid) ai++
    const a = acts[ai]
    const lens = a && a.start <= mid ? lensOf(a.mode) : 'drive'
    trails.push({ path: p.pts.map(([, lat, lng]) => [lng, lat]), ts, color: INK_OF[lens], t0: ts[0], t1: ts[ts.length - 1], lens })
  }
  for (const a of acts) { const lens = lensOf(a.mode); trails.push({ path: [[a.s_lng, a.s_lat], [a.e_lng, a.e_lat]], ts: [a.start - t0, a.end - t0], color: INK_OF[lens], t0: a.start - t0, t1: a.end - t0, lens }) }
  return trails
}

let cache: { data: Data; trails: Trail[]; byLens: Map<Lens, Trail[]>; dots: Dot[]; labels: Map<number, Dot[]>; active: Trail[]; activeKey: string } | null = null
function prepared(data: Data) {
  if (cache?.data !== data) {
    const dots: Dot[] = Object.entries(data.places).filter(([, p]) => p.semantic_type !== 'INFERRED_HOME' && p.n_visits >= 2)
      .map(([id, p]) => ({ ...p, id, title: (p.name ?? p.label ?? '').trim() })).sort((a, b) => b.n_visits - a.n_visits)
    cache = { data, trails: buildTrails(data, data.meta.range[0]), byLens: new Map(), dots, labels: new Map(), active: [], activeKey: '' }
  }
  return cache
}

/** Wide head passes rasterize every segment they are given, so hand them only trails alive in [from, to]; same array back while the set is unchanged. */
function activeTrails(c: NonNullable<typeof cache>, all: Trail[], from: number, to: number): Trail[] {
  const idx: number[] = []
  all.forEach((t, i) => { if (t.t0 <= to && t.t1 >= from) idx.push(i) })
  const key = all.length + ':' + idx.join(',')
  if (key !== c.activeKey) { c.activeKey = key; c.active = idx.map((i) => all[i]) }
  return c.active
}
function lensTrails(c: NonNullable<typeof cache>, lens: Lens): Trail[] {
  let t = c.byLens.get(lens)
  if (!t) c.byLens.set(lens, (t = lens === 'all' ? c.trails : c.trails.filter((x) => x.lens === lens)))
  return t
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

export function mapLayers(data: Data, now: number, rate: number, playing: boolean, reveal = now, zoom = 10, lens: Lens = 'all'): Layer[] {
  const c = prepared(data)
  const { dots, labels } = c
  const trails = lensTrails(c, lens)
  const zb = Math.floor(zoom * 2) / 2
  let labelled = labels.get(zb)
  if (!labelled) labels.set(zb, (labelled = labelDots(dots, zb)))
  const paper = STOCK
  const tint = (c: RGBA): RGBA => c
  const t0 = data.meta.range[0]
  const layers: Layer[] = []
  if (!playing) {
    // Paused: the whole record as hairlines, like the strip printed on the pass.
    layers.push(new PathLayer<Trail>({ id: 'record', data: trails, getPath: (d) => d.path, getColor: (d) => { const c = tint(d.color); return [c[0], c[1], c[2], d.lens === 'fly' ? 140 : 90] }, widthMinPixels: 1.2, widthMaxPixels: 2.5, opacity: 1 }))
  }
  const trail = (id: string, length: number, color: (d: Trail) => RGBA, width: number, opacity: number, data: Trail[] = trails) => new TripsLayer<Trail>({
    id, data, getPath: (d) => d.path, getTimestamps: (d) => d.ts, getColor: color,
    currentTime: now - t0, trailLength: length, fadeTrail: true, widthMinPixels: width, widthMaxPixels: width * 2, capRounded: true, jointRounded: true, opacity,
  })
  const headLen = HEAD_REAL_S * rate
  const head = activeTrails(c, trails, now - t0 - headLen * 1.6, now - t0)
  layers.push(
    // Week-long wake over everything in its ink, then a wide flat red head over only the live trails: ink flooding the screen.
    trail('trail-long', LONG_TRAIL_S, (d) => tint(d.color), 2.5, playing ? 0.85 : 0.4),
    trail('trail-head', headLen, () => RED, 7, 1, head),
    new ScatterplotLayer<Dot>({
      id: 'places', data: dots, pickable: true,
      getPosition: (d) => [d.lng, d.lat],
      getRadius: (d) => 20 + Math.sqrt(d.n_visits) * 12, radiusMinPixels: 2, radiusMaxPixels: 16,
      getFillColor: (d) => [INK[0], INK[1], INK[2], d.first_ts <= reveal ? 200 : 0],
      stroked: true, getLineColor: (d) => [paper[0], paper[1], paper[2], d.first_ts <= reveal ? 255 : 0], lineWidthMinPixels: 2,
      updateTriggers: { getFillColor: [Math.floor(reveal / 3600)], getLineColor: [Math.floor(reveal / 3600)] },
    }),
    new TextLayer<Dot>({
      id: 'labels', data: labelled,
      getPosition: (d) => [d.lng, d.lat], getText: (d) => d.title.toUpperCase(),
      getColor: (d) => [INK[0], INK[1], INK[2], d.first_ts <= reveal ? 255 : 0],
      getSize: 12, fontFamily: '"Big Shoulders Display Variable", Impact, sans-serif', fontWeight: 800, characterSet: 'auto', fontSettings: { sdf: true, buffer: 4 },
      outlineWidth: 4, outlineColor: [239, 230, 210, 235],
      getTextAnchor: 'start', getAlignmentBaseline: 'center', getPixelOffset: [12, 0],
      updateTriggers: { getColor: [Math.floor(reveal / 3600)] },
    }),
  )
  const here = positionAt(data, now)
  if (here) layers.push(
    // The stamp: a red ring and a solid dot, no glow.
    new ScatterplotLayer<{ lng: number; lat: number }>({
      id: 'here-ring', data: [here], getPosition: (d) => [d.lng, d.lat], getRadius: 1, radiusMinPixels: 16, radiusMaxPixels: 16,
      getFillColor: [0, 0, 0, 0], stroked: true, getLineColor: RED, lineWidthMinPixels: 3,
    }),
    new ScatterplotLayer<{ lng: number; lat: number }>({
      id: 'here', data: [here], getPosition: (d) => [d.lng, d.lat], getRadius: 1, radiusMinPixels: 7, radiusMaxPixels: 7,
      getFillColor: RED, stroked: true, getLineColor: paper, lineWidthMinPixels: 2.5,
    }),
  )
  return layers
}
