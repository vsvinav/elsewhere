import { IconLayer, PathLayer, ScatterplotLayer, TextLayer, TripsLayer, type Layer } from 'deck.gl'
import type { Data, Place } from '../data/types'
import { whereaboutsAt } from '../analytics/position'
import { LENS_COLOR, lensOf, type Lens } from '../analytics/lens'

type RGBA = [number, number, number, number]
const STOCK: RGBA = [239, 230, 210, 255]
const INK: RGBA = [20, 20, 20, 255]
export const LONG_TRAIL_S = 7 * 86400
const HEAD_REAL_S = 4

interface Trail { path: [number, number][]; ts: number[]; color: RGBA; t0: number; t1: number; lens: Lens }
const rgba = (hex: string): RGBA => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255]
const INK_OF = Object.fromEntries(Object.entries(LENS_COLOR).map(([k, v]) => [k, rgba(v)])) as Record<Lens, RGBA>

// Position markers, drawn as masks so they take the ink of the current movement.
const svg = (d: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 32 32"><path fill="#000" d="${d}"/></svg>`)}`
const ICON: Record<Lens | 'still', { url: string; width: number; height: number; mask: true }> = {
  fly: { url: svg('M16 2c1.2 0 2 1 2 2.6V12l11 6.5v3l-11-3.4v6.2l3 2.2V29l-5-1.5L11 29v-2.5l3-2.2v-6.2L3 21.5v-3L14 12V4.6C14 3 14.8 2 16 2z'), width: 64, height: 64, mask: true },
  drive: { url: svg('M9 6h14l3 8h2a2 2 0 0 1 2 2v7h-3v2a2 2 0 0 1-4 0v-2H9v2a2 2 0 0 1-4 0v-2H2v-7a2 2 0 0 1 2-2h2l3-8zm1.5 2.5L8.6 14h14.8l-1.9-5.5h-11zM7 17.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm18 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z'), width: 64, height: 64, mask: true },
  transit: { url: svg('M8 4h16a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3l2 3v1h-3l-2-3H11l-2 3H6v-1l2-3a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3zm0 4v6h7V8H8zm9 0v6h7V8h-7zM9.5 17a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm13 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z'), width: 64, height: 64, mask: true },
  foot: { url: svg('M18 3a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zm-3.5 6.5 3 .5 2 3.5 4 2v2.5l-4.5-2-1.5-2-1 5 3 3.5V30h-2.5l-3-5.5-3 5.5H9l3.5-7.5 1-6-2 1.5V22H9v-6l5.5-6.5z'), width: 64, height: 64, mask: true },
  all: { url: svg('M16 16m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0'), width: 64, height: 64, mask: true },
  still: { url: svg('M16 16m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0'), width: 64, height: 64, mask: true },
}
interface Dot extends Place { id: string; title: string }

/** Points along the great circle from a to b, so a flight bends the way it was flown instead of cutting straight across. */
function greatCircle(a: [number, number], b: [number, number], n: number): [number, number][] {
  const r = Math.PI / 180
  const [l1, f1, l2, f2] = [a[0] * r, a[1] * r, b[0] * r, b[1] * r]
  const d = 2 * Math.asin(Math.sqrt(Math.sin((f2 - f1) / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin((l2 - l1) / 2) ** 2))
  if (d < 1e-9) return [a, b]
  const out: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d)
    const x = A * Math.cos(f1) * Math.cos(l1) + B * Math.cos(f2) * Math.cos(l2)
    const y = A * Math.cos(f1) * Math.sin(l1) + B * Math.cos(f2) * Math.sin(l2)
    const z = A * Math.sin(f1) + B * Math.sin(f2)
    out.push([Math.atan2(y, x) / r, Math.atan2(z, Math.hypot(x, y)) / r])
  }
  return out
}

// TripsLayer keeps timestamps in float32; offset by t0 to keep precision.
export function buildTrails(data: Data, t0: number): Trail[] {
  const trails: Trail[] = []
  // A GPS path takes the lens of the activity it sits inside; paths are sorted by time, as are activities.
  const acts = data.activities, traced = new Set<number>()
  let ai = 0
  for (const p of data.paths) if (p.pts.length > 1) {
    const ts = p.pts.map(([ts]) => ts - t0), mid = (p.start + p.end) / 2
    while (ai < acts.length && acts[ai].end < mid) ai++
    const a = acts[ai], hit = !!a && a.start <= mid
    if (hit) traced.add(ai)
    const lens = hit ? lensOf(a.mode) : 'drive'
    trails.push({ path: p.pts.map(([, lat, lng]) => [lng, lat]), ts, color: INK_OF[lens], t0: ts[0], t1: ts[ts.length - 1], lens })
  }
  // A leg with a GPS trace is already drawn; only untraced legs (flights, gaps in the record) get a synthetic line.
  for (const [i, a] of acts.entries()) {
    if (traced.has(i)) continue
    const lens = lensOf(a.mode)
    const path = lens === 'fly' && a.m > 80_000 ? greatCircle([a.s_lng, a.s_lat], [a.e_lng, a.e_lat], 48) : [[a.s_lng, a.s_lat], [a.e_lng, a.e_lat]] as [number, number][]
    const ts = path.map((_, i) => a.start - t0 + ((a.end - a.start) * i) / (path.length - 1))
    trails.push({ path, ts, color: INK_OF[lens], t0: a.start - t0, t1: a.end - t0, lens })
  }
  return trails
}

// Trails key on the record's geometry and dots on its places, so a place-name flush never re-uploads 80k points.
let cache: { paths: Data['paths']; places: Data['places']; trails: Trail[]; byLens: Map<Lens, Trail[]>; dots: Dot[]; labels: Map<number, Dot[]>; active: Trail[]; activeIdx: number[]; activeOf: Trail[] | null } | null = null
function prepared(data: Data) {
  if (cache?.paths !== data.paths) cache = { paths: data.paths, places: null as never, trails: buildTrails(data, data.meta.range[0]), byLens: new Map(), dots: [], labels: new Map(), active: [], activeIdx: [], activeOf: null }
  if (cache.places !== data.places) {
    cache.places = data.places
    cache.dots = Object.entries(data.places).filter(([, p]) => p.semantic_type !== 'INFERRED_HOME' && p.n_visits >= 2)
      .map(([id, p]) => ({ ...p, id, title: (p.name ?? p.label ?? '').trim() })).sort((a, b) => b.n_visits - a.n_visits)
    cache.labels = new Map()
  }
  return cache
}

/** Wide head passes rasterize every segment they are given, so hand them only trails alive in [from, to]; same array back while the set is unchanged. */
function activeTrails(c: NonNullable<typeof cache>, all: Trail[], from: number, to: number): Trail[] {
  const idx: number[] = []
  all.forEach((t, i) => { if (t.t0 <= to && t.t1 >= from) idx.push(i) })
  const same = c.activeOf === all && idx.length === c.activeIdx.length && idx.every((v, i) => v === c.activeIdx[i])
  if (!same) { c.activeOf = all; c.activeIdx = idx; c.active = idx.map((i) => all[i]) }
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
  const t0 = data.meta.range[0]
  const layers: Layer[] = []
  if (!playing) {
    // Paused: the whole record as hairlines, like the strip printed on the pass.
    layers.push(new PathLayer<Trail>({ id: 'record', data: trails, getPath: (d) => d.path, getColor: (d) => [d.color[0], d.color[1], d.color[2], d.lens === 'fly' ? 140 : 90], widthMinPixels: 1.2, widthMaxPixels: 2.5, opacity: 1 }))
  }
  const trail = (id: string, length: number, color: (d: Trail) => RGBA, width: number, opacity: number, data: Trail[] = trails) => new TripsLayer<Trail>({
    id, data, getPath: (d) => d.path, getTimestamps: (d) => d.ts, getColor: color,
    currentTime: now - t0, trailLength: length, fadeTrail: true, widthMinPixels: width, widthMaxPixels: width * 2, capRounded: true, jointRounded: true, opacity,
  })
  const headLen = HEAD_REAL_S * rate
  const head = activeTrails(c, trails, now - t0 - headLen * 1.6, now - t0)
  layers.push(
    // Week-long wake over everything in its ink, then a wide head in the leg's own ink over only the live trails.
    trail('trail-long', LONG_TRAIL_S, (d) => d.color, 2.5, playing ? 0.85 : 0.4),
    trail('trail-head', headLen, (d) => d.color, 7, 1, head),
    new ScatterplotLayer<Dot>({
      id: 'places', data: dots, pickable: true,
      getPosition: (d) => [d.lng, d.lat],
      getRadius: (d) => 20 + Math.sqrt(d.n_visits) * 12, radiusMinPixels: 2, radiusMaxPixels: 16,
      getFillColor: (d) => [INK[0], INK[1], INK[2], d.first_ts <= reveal ? 200 : 0],
      stroked: true, getLineColor: (d) => [STOCK[0], STOCK[1], STOCK[2], d.first_ts <= reveal ? 255 : 0], lineWidthMinPixels: 2,
      updateTriggers: { getFillColor: [Math.floor(reveal / 3600)], getLineColor: [Math.floor(reveal / 3600)] },
    }),
    new TextLayer<Dot>({
      id: 'labels', data: labelled,
      getPosition: (d) => [d.lng, d.lat], getText: (d) => d.title.toUpperCase(),
      getColor: (d) => [INK[0], INK[1], INK[2], d.first_ts <= reveal ? 255 : 0],
      getSize: 11, fontFamily: '"Archivo Variable", Archivo, sans-serif', fontWeight: 700, characterSet: 'auto', fontSettings: { sdf: true, buffer: 3 },
      outlineWidth: 2, outlineColor: [239, 230, 210, 235],
      getTextAnchor: 'start', getAlignmentBaseline: 'center', getPixelOffset: [12, 0],
      updateTriggers: { getColor: [Math.floor(reveal / 3600)] },
    }),
  )
  const w = whereaboutsAt(data, now)
  if (w) {
    const still = w.mode === 'STILL', kind = still ? 'still' : lensOf(w.mode), ink = still ? INK : INK_OF[kind as Lens]
    const turns = kind === 'fly' || kind === 'drive'
    layers.push(
      // The stamp: a stock disc with the leg's ink ring, and the vehicle inside turned the way it is going.
      new ScatterplotLayer<typeof w>({
        id: 'here-ring', data: [w], getPosition: (d) => [d.lng, d.lat], getRadius: 1, radiusMinPixels: still ? 11 : 20, radiusMaxPixels: still ? 11 : 20,
        getFillColor: STOCK, stroked: true, getLineColor: ink, lineWidthMinPixels: 3, updateTriggers: { getLineColor: kind, getRadius: still },
      }),
      new IconLayer<typeof w>({
        id: 'here', data: [w], getPosition: (d) => [d.lng, d.lat], getIcon: () => ICON[kind], getColor: ink,
        getSize: still ? 12 : 27, sizeUnits: 'pixels', getAngle: (d) => (turns ? -d.heading : 0), billboard: false,
        updateTriggers: { getIcon: kind, getColor: kind, getAngle: turns },
      }),
    )
  }
  return layers
}
