import { isHome } from '../analytics/geo'
import { cluster, type Group } from './cluster'
import { IconLayer, PathLayer, ScatterplotLayer, TextLayer, TripsLayer, type Layer } from 'deck.gl'
import { PathStyleExtension } from '@deck.gl/extensions'
import { degPerPx, simplifyIdx } from './simplify'
import { paceOf } from './camera'
import { BIG_KM } from './pace'
import type { Data, Place } from '../data/types'
import { segmentAt, whereaboutsAt } from '../analytics/position'
import { LENS_COLOR, lensOf, type Lens } from '../analytics/lens'
import { legsOf } from '../analytics/legs'
import { CAT_COLOR, categoryOf, type Cat } from '../analytics/category'
import { HeadingEase, iconAngle, stampHeading, type StampKind } from './heading'

type RGBA = [number, number, number, number]
const STOCK: RGBA = [239, 230, 210, 255]
const INK: RGBA = [20, 20, 20, 255]
const RED: RGBA = [214, 60, 32, 255]
// The wake is measured in screen time, so it reads the same at a stroll and at a day a second.
const WAKE_REAL_S = 16
const HEAD_REAL_S = 4
const MIN_WAKE_S = 3 * 3600, MAX_WAKE_S = 30 * 86400
export const wakeLength = (rate: number) => Math.min(MAX_WAKE_S, Math.max(MIN_WAKE_S, rate * WAKE_REAL_S))
// The wake eases toward its target over ~2 s, so a pace change never snaps finished routes in or out of view.
let wakeShown = 0, wakeAt = 0
function easedWake(rate: number): number {
  const t = performance.now(), want = wakeLength(rate)
  if (!wakeShown || t - wakeAt > 2000) wakeShown = want
  else wakeShown += (want - wakeShown) * Math.min(1, (t - wakeAt) / 2000)
  wakeAt = t
  return wakeShown
}
const DASH = [new PathStyleExtension({ dash: true })]

interface Trail { path: [number, number][]; ts: number[]; color: RGBA; t0: number; t1: number; lens: Lens; guessed: boolean }
const rgba = (hex: string): RGBA => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255]
const INK_OF = Object.fromEntries(Object.entries(LENS_COLOR).map(([k, v]) => [k, rgba(v)])) as Record<Lens, RGBA>

// Position markers, drawn as masks so they take the ink of the current movement.
const svg = (d: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 32 32"><path fill="#000" d="${d}"/></svg>`)}`
const ICON: Record<StampKind, { url: string; width: number; height: number; mask: true }> = {
  fly: { url: svg('M16 2c1.2 0 2 1 2 2.6V12l11 6.5v3l-11-3.4v6.2l3 2.2V29l-5-1.5L11 29v-2.5l3-2.2v-6.2L3 21.5v-3L14 12V4.6C14 3 14.8 2 16 2z'), width: 64, height: 64, mask: true },
  // Seen from above and travelling up the box, like the plane, so each still reads once turned along its leg.
  drive: { url: svg('M11 3h10a3 3 0 0 1 3 3v20a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zm0 6-1 5h12l-1-5H11zm-1 11 1 5h10l1-5H10zM6 8h2v6H6zm18 0h2v6h-2zM6 19h2v6H6zm18 0h2v6h-2z'), width: 64, height: 64, mask: true },
  transit: { url: svg('M12 2h8a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4zm0 4-1 4h10l-1-4h-8zm-1 7v3h10v-3H11zm0 6v3h10v-3H11zm0 6v2h10v-2H11z'), width: 64, height: 64, mask: true },
  foot: { url: svg('M11 8.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zm0 7a3.5 7 0 1 1 0 14 3.5 7 0 0 1 0-14zM21 0.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zm0 7a3.5 7 0 1 1 0 14 3.5 7 0 0 1 0-14z'), width: 64, height: 64, mask: true },
  all: { url: svg('M16 16m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0'), width: 64, height: 64, mask: true },
  still: { url: svg('M16 16m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0'), width: 64, height: 64, mask: true },
  // Fast-forward chevrons: shown when the replay is too quick for the vehicle to matter.
  ff: { url: svg('M22 16a6 6 0 1 1-12 0 6 6 0 0 1 12 0zM2 13h8v2H2zm-2 2.5h9v1.5H0zM3 18h7v2H3z'), width: 64, height: 64, mask: true },
}
// The stamp only changes once the new kind has held for a beat, so fast replay does not strobe between icons.
const STAMP_HOLD_MS = 350
const FF_PACE = 8
let stamp = { shown: 'still' as StampKind, pending: 'still' as StampKind, since: 0 }
// The stamp's ring grows and shrinks over a few frames instead of snapping between still and moving.
let ringR = 0, ringAt = 0
const heading = new HeadingEase()
function easedRing(want: number): number {
  const t = performance.now()
  if (!ringR || t - ringAt > 500) ringR = want
  else ringR += (want - ringR) * Math.min(1, (t - ringAt) / 180)
  ringAt = t
  return ringR
}
function stampKind(kind: StampKind, rate: number, bigLeg: boolean): StampKind {
  const want: StampKind = kind !== 'still' && !bigLeg && paceOf(rate) >= FF_PACE ? 'ff' : kind
  const t = performance.now()
  if (want !== stamp.pending) { stamp.pending = want; stamp.since = t }
  if (want !== stamp.shown && t - stamp.since >= STAMP_HOLD_MS) stamp.shown = want
  return stamp.shown
}
// The map pin: a teardrop with a stock hole, anchored at its point.
const PIN = { url: svg('M16 1C9.9 1 5 5.9 5 12c0 8 11 19 11 19s11-11 11-19c0-6.1-4.9-11-11-11zm0 6.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z'), width: 64, height: 64, anchorY: 64, mask: true as const }
// Same teardrop, solid: drawn under the coloured one a touch larger as its ink outline.
const PIN_BACK = { url: svg('M16 1C9.9 1 5 5.9 5 12c0 8 11 19 11 19s11-11 11-19c0-6.1-4.9-11-11-11z'), width: 64, height: 64, anchorY: 64, mask: true as const }
const HOUSE = { url: svg('M16 3 2 15h4v13h8v-8h4v8h8V15h4z'), width: 64, height: 64, mask: true as const }
interface Dot extends Place { id: string; title: string; cat: Cat; ink: RGBA }
const CAT_INK = Object.fromEntries(Object.entries(CAT_COLOR).map(([k, v]) => [k, rgba(v)])) as Record<Cat, RGBA>

// TripsLayer keeps timestamps in float32; offset by t0 to keep precision.
export function buildTrails(data: Data, t0: number): Trail[] {
  return legsOf(data).map((l) => ({ path: l.path, ts: l.ts.map((t) => t - t0), color: INK_OF[l.lens], t0: l.ts[0] - t0, t1: l.ts[l.ts.length - 1] - t0, lens: l.lens, guessed: l.guessed }))
}

// Trails key on the record's geometry and dots on its places, so a place-name flush never re-uploads 80k points.
let cache: { paths: Data['paths']; places: Data['places']; trails: Trail[]; byLens: Map<Lens, Trail[]>; simp: Map<string, Trail[]>; dots: Dot[]; all: Dot[]; shown: { key: string; dots: Dot[]; labels: Map<number, Dot[]>; clusters: Map<number, { singles: Dot[]; groups: Group<Dot>[] }> }; homes: Dot[]; labels: Map<number, Dot[]>; active: Trail[]; activeIdx: number[]; activeOf: Trail[] | null; revealed: Dot[]; revealedDay: number; revealedOf: Dot[] | null } | null = null
function prepared(data: Data) {
  if (cache?.paths !== data.paths) cache = { paths: data.paths, places: null as never, trails: buildTrails(data, data.meta.range[0]), byLens: new Map(), simp: new Map(), dots: [], all: [], shown: { key: '', dots: [], labels: new Map(), clusters: new Map() }, homes: [], labels: new Map(), active: [], activeIdx: [], activeOf: null, revealed: [], revealedDay: -1, revealedOf: null }
  if (cache.places !== data.places) {
    cache.places = data.places
    // Replay dots are the places you kept going back to; the Map tab pins every stop.
    cache.all = Object.entries(data.places).filter(([, p]) => !isHome(p))
      .map(([id, p]) => { const cat = categoryOf(p); return { ...p, id, title: (p.name ?? p.label ?? '').trim(), cat, ink: CAT_INK[cat] } }).sort((a, b) => b.n_visits - a.n_visits)
    cache.dots = cache.all.filter((d) => d.n_visits >= 2)
    cache.homes = Object.entries(data.places).filter(([, p]) => isHome(p)).map(([id, p]) => ({ ...p, id, title: (p.name ?? p.label ?? 'Home').trim(), cat: 'other' as Cat, ink: RED }))
    cache.shown = { key: '', dots: [], labels: new Map(), clusters: new Map() }
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
/** Where the drawn trail's head is at `t` (seconds from t0): the marker is placed from the same simplified points the GPU draws, so it never leads or trails the line. */
function trailHead(trails: Trail[], t: number): { lng: number; lat: number } | null {
  let lo = 0, hi = trails.length - 1
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (trails[m].t0 <= t) lo = m; else hi = m - 1 }
  const tr = trails[lo]
  if (!tr || tr.t0 > t || tr.t1 < t) return null
  const ts = tr.ts
  let i = 1
  while (i < ts.length - 1 && ts[i] < t) i++
  const [x0, y0] = tr.path[i - 1], [x1, y1] = tr.path[i]
  const k = ts[i] > ts[i - 1] ? (t - ts[i - 1]) / (ts[i] - ts[i - 1]) : 1
  return { lng: x0 + (x1 - x0) * k, lat: y0 + (y1 - y0) * k }
}
/** Dots visited by `reveal`, cached per day so the array is stable between frames. */
function revealed(c: NonNullable<typeof cache>, dots: Dot[], reveal: number): Dot[] {
  const day = Math.floor(reveal / 86400)
  if (c.revealedDay !== day || c.revealedOf !== dots) { c.revealedDay = day; c.revealedOf = dots; c.revealed = dots.filter((d) => d.first_ts <= (day + 1) * 86400) }
  return c.revealed
}
function lensTrails(c: NonNullable<typeof cache>, lens: Lens): Trail[] {
  let t = c.byLens.get(lens)
  if (!t) c.byLens.set(lens, (t = lens === 'all' ? c.trails : c.trails.filter((x) => x.lens === lens)))
  return t
}
/** Trails thinned to ~1.5 px at a whole-number zoom: GPS jitter is never drawn, and the GPU gets a fraction of the points when zoomed out. */
function simplified(c: NonNullable<typeof cache>, lens: Lens, zoom: number): Trail[] {
  const zb = Math.max(2, Math.min(16, Math.round(zoom)))
  const key = `${lens}:${zb}`
  let out = c.simp.get(key)
  if (!out) {
    const tol = degPerPx(zb) * 1.5
    out = lensTrails(c, lens).map((t) => {
      if (t.path.length <= 2) return t
      const idx = simplifyIdx(t.path, tol)
      return idx.length === t.path.length ? t : { ...t, path: idx.map((i) => t.path[i]), ts: idx.map((i) => t.ts[i]) }
    })
    c.simp.set(key, out)
  }
  return out
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

export interface PinOpts { hidden: Cat[]; selected: string | null; sizeBy: 'visits' | 'hours' }
/** Every stop in the record as pins and nothing else: the Map tab. */
export function pinLayers(data: Data, zoom: number, o: PinOpts): Layer[] {
  const c = prepared(data)
  const key = o.hidden.slice().sort().join()
  if (c.shown.key !== key || (c.shown.dots.length === 0 && c.all.length)) c.shown = { key, dots: o.hidden.length ? c.all.filter((d) => !o.hidden.includes(d.cat)) : c.all, labels: new Map(), clusters: new Map() }
  const zb = Math.floor(zoom * 2) / 2
  let cl = c.shown.clusters.get(zb)
  if (!cl) c.shown.clusters.set(zb, (cl = cluster(c.shown.dots, zb, 60)))
  const { singles, groups } = cl
  let labelled = c.shown.labels.get(zb)
  // Homes label first so they always win their box.
  if (!labelled) c.shown.labels.set(zb, (labelled = labelDots([...c.homes, ...singles], zb)))
  // Zoomed out, pins shrink with the map so a cluster never blankets an island.
  const k = Math.max(0.45, Math.min(1, (zoom - 1) / 5)) + Math.max(0, Math.min(0.3, (zoom - 11) / 10))
  const weight = (d: Dot) => (o.sizeBy === 'visits' ? d.n_visits : d.total_hours / 3)
  const size = (d: Dot) => k * (16 + Math.min(14, Math.sqrt(weight(d)) * 2.2))
  const sel = o.selected ? c.all.find((d) => d.id === o.selected) ?? c.homes.find((d) => d.id === o.selected) : undefined
  const selHome = !!sel && c.homes.includes(sel)
  const font = { fontFamily: '"Archivo Variable", Archivo, sans-serif', fontWeight: 700, characterSet: 'auto', fontSettings: { sdf: true, buffer: 3 } } as const
  const layers: Layer[] = [
    // Groups: an ink disc sized by how many stops it holds, the count printed in stock.
    new ScatterplotLayer<Group<Dot>>({
      id: 'groups', data: groups, pickable: true, getPosition: (d) => [d.lng, d.lat],
      radiusUnits: 'pixels', getRadius: (d) => k * (10 + Math.min(12, Math.log2(d.items.length) * 2.2)), updateTriggers: { getRadius: [k] },
      getFillColor: INK, stroked: true, getLineColor: STOCK, lineWidthUnits: 'pixels', getLineWidth: 2,
    }),
    new TextLayer<Group<Dot>>({
      id: 'group-counts', data: groups, getPosition: (d) => [d.lng, d.lat], getText: (d) => String(d.items.length),
      getColor: STOCK, getSize: Math.max(9, 12 * k), ...font, getTextAnchor: 'middle', getAlignmentBaseline: 'center',
    }),
    // Singles: a small pin in its category's ink over an ink outline.
    new IconLayer<Dot>({ id: 'pin-back', data: singles, getPosition: (d) => [d.lng, d.lat], getIcon: () => PIN_BACK, getColor: INK, getSize: (d) => size(d) + 4 * k, sizeUnits: 'pixels', billboard: false, updateTriggers: { getSize: [o.sizeBy, k] } }),
    new IconLayer<Dot>({
      id: 'places', data: singles, pickable: true,
      getPosition: (d) => [d.lng, d.lat], getIcon: () => PIN, getColor: (d) => d.ink,
      getSize: size, sizeUnits: 'pixels', billboard: false, updateTriggers: { getSize: [o.sizeBy, k] },
    }),
    // Homes stay put whatever is toggled: a red house with an ink outline.
    new IconLayer<Dot>({ id: 'home-back', data: c.homes, getPosition: (d) => [d.lng, d.lat], getIcon: () => HOUSE, getColor: INK, getSize: 26 * k, sizeUnits: 'pixels', billboard: false }),
    new IconLayer<Dot>({ id: 'homes', data: c.homes, pickable: true, getPosition: (d) => [d.lng, d.lat], getIcon: () => HOUSE, getColor: RED, getSize: 20 * k, sizeUnits: 'pixels', billboard: false }),
    new TextLayer<Dot>({
      id: 'labels', data: labelled, getPosition: (d) => [d.lng, d.lat], getText: (d) => d.title.toUpperCase(),
      getColor: INK, getSize: 11, ...font, outlineWidth: 2, outlineColor: [239, 230, 210, 235],
      getTextAnchor: 'start', getAlignmentBaseline: 'center', getPixelOffset: [9 * k, -13 * k], updateTriggers: { getPixelOffset: [k] },
    }),
  ]
  if (sel) {
    // The open pin sits on top with a stock halo, so it reads in a crowd.
    layers.push(new ScatterplotLayer<Dot>({ id: 'pin-halo', data: [sel], getPosition: (d) => [d.lng, d.lat], getRadius: 1, radiusMinPixels: 18, radiusMaxPixels: 18, getFillColor: [239, 230, 210, 170], stroked: true, getLineColor: INK, lineWidthMinPixels: 2 }),
      new IconLayer<Dot>({ id: 'pin-top-back', data: [sel], getPosition: (d) => [d.lng, d.lat], getIcon: () => (selHome ? HOUSE : PIN_BACK), getColor: INK, getSize: selHome ? 34 * k : size(sel) + 12, sizeUnits: 'pixels', billboard: false, updateTriggers: { getIcon: [selHome] } }),
      new IconLayer<Dot>({ id: 'pin-top', data: [sel], getPosition: (d) => [d.lng, d.lat], getIcon: () => (selHome ? HOUSE : PIN), getColor: sel.ink, getSize: selHome ? 27 * k : size(sel) + 8, sizeUnits: 'pixels', billboard: false, updateTriggers: { getIcon: [selHome] } }))
  }
  return layers
}

export function mapLayers(data: Data, now: number, rate: number, playing: boolean, reveal = now, zoom = 10, lens: Lens = 'all'): Layer[] {
  const c = prepared(data)
  const { dots, labels } = c
  const trails = simplified(c, lens, zoom)
  const zb = Math.floor(zoom * 2) / 2
  let labelled = labels.get(zb)
  if (!labelled) labels.set(zb, (labelled = labelDots(dots, zb)))
  const t0 = data.meta.range[0]
  const layers: Layer[] = []
  if (!playing) {
    // Paused: the whole record as hairlines, like the strip printed on the pass.
    layers.push(new PathLayer<Trail>({ id: 'record', data: trails, getPath: (d) => d.path, getColor: (d) => [d.color[0], d.color[1], d.color[2], d.lens === 'fly' ? 140 : d.guessed ? 50 : 90], widthMinPixels: 1.2, widthMaxPixels: 2.5, opacity: 1 }))
  }
  const trail = (id: string, length: number, color: (d: Trail) => RGBA, width: number, opacity: number, data: Trail[] = trails, dashed = false) => new TripsLayer<Trail>({
    id, data, getPath: (d) => d.path, getTimestamps: (d) => d.ts, getColor: (d) => { const c = color(d); return d.guessed ? [c[0], c[1], c[2], 110] : c },
    currentTime: now - t0, trailLength: length, fadeTrail: true, widthUnits: 'pixels', getWidth: width, widthMinPixels: width, widthMaxPixels: width * 2, capRounded: !dashed, jointRounded: true, opacity,
    ...(dashed ? { extensions: DASH, getDashArray: [5, 4], dashUnits: 'pixels' as const } : {}),
  })
  const headLen = HEAD_REAL_S * rate, wake = easedWake(rate)
  const head = activeTrails(c, trails, now - t0 - headLen * 1.6, now - t0)
  layers.push(
    // A dotted wake that fades over ~16 s of screen time, then a solid head in the leg's own ink over only the live trails.
    trail('trail-long', wake, (d) => d.color, 2.5, playing ? 0.8 : 0.4, trails, true),
    trail('trail-head', headLen, (d) => d.color, 6, 1, head),
  )
  // Only places already visited exist on the map; a fresh one fades in over a second of screen time, labels first without their halo so nothing ghosts.
  const fadeSpan = Math.max(60, rate * 1.2)
  const shownDots = revealed(c, dots, reveal), arriving = labelled.filter((d) => d.first_ts <= reveal && reveal - d.first_ts < fadeSpan), settled = labelled.filter((d) => reveal - d.first_ts >= fadeSpan)
  const alpha = (d: Dot) => Math.min(1, (reveal - d.first_ts) / fadeSpan)
  const font = { fontFamily: '"Archivo Variable", Archivo, sans-serif', fontWeight: 700, characterSet: 'auto', fontSettings: { sdf: true, buffer: 3 }, getSize: 11, getPixelOffset: [12, 0] as [number, number], getTextAnchor: 'start' as const, getAlignmentBaseline: 'center' as const }
  layers.push(
    new ScatterplotLayer<Dot>({
      id: 'places', data: shownDots, pickable: true,
      getPosition: (d) => [d.lng, d.lat],
      getRadius: (d) => 20 + Math.sqrt(d.n_visits) * 12, radiusMinPixels: 2, radiusMaxPixels: 16,
      getFillColor: (d) => [INK[0], INK[1], INK[2], 220 * alpha(d)],
      stroked: true, getLineColor: (d) => [STOCK[0], STOCK[1], STOCK[2], 255 * alpha(d)], lineWidthMinPixels: 2,
      updateTriggers: { getFillColor: reveal, getLineColor: reveal },
    }),
    new TextLayer<Dot>({ id: 'labels', data: settled, getPosition: (d) => [d.lng, d.lat], getText: (d) => d.title.toUpperCase(), getColor: INK, ...font, outlineWidth: 2, outlineColor: [239, 230, 210, 235] }),
    new TextLayer<Dot>({ id: 'labels-in', data: arriving, getPosition: (d) => [d.lng, d.lat], getText: (d) => d.title.toUpperCase(), getColor: (d) => [INK[0], INK[1], INK[2], 255 * alpha(d)], ...font, updateTriggers: { getColor: reveal } }),
  )
  const at = whereaboutsAt(data, now)
  const w = at && at.mode !== 'STILL' ? { ...at, ...(trailHead(trails, now - t0) ?? {}) } : at
  if (w) {
    const still = w.mode === 'STILL'
    const seg = still ? null : segmentAt(data, now)
    const kind = stampKind(still ? 'still' : lensOf(w.mode), rate, !!seg && seg.kind === 'activity' && seg.km >= BIG_KM)
    const ink = kind === 'still' || kind === 'ff' ? INK : INK_OF[kind]
    const small = kind === 'still'
    const r = easedRing(small ? 11 : 20)
    const angle = heading.at(stampHeading(seg, kind), performance.now())
    layers.push(
      // The stamp: a stock disc with the leg's ink ring, and the vehicle inside turned along a long leg, upright on a short one.
      new ScatterplotLayer<typeof w>({
        id: 'here-ring', data: [w], getPosition: (d) => [d.lng, d.lat], getRadius: 1, radiusMinPixels: r, radiusMaxPixels: r,
        getFillColor: STOCK, stroked: true, getLineColor: ink, lineWidthMinPixels: 3, updateTriggers: { getLineColor: kind },
      }),
      new IconLayer<typeof w>({
        id: 'here', data: [w], getPosition: (d) => [d.lng, d.lat], getIcon: () => ICON[kind], getColor: ink,
        getSize: r * 1.3, sizeUnits: 'pixels', billboard: false, getAngle: () => iconAngle(angle),
        updateTriggers: { getIcon: kind, getColor: kind, getAngle: angle },
      }),
    )
  }
  return layers
}
