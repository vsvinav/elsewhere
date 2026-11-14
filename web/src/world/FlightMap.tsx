import { useEffect, useMemo, useRef, useState } from 'react'
import { DeckGL, GeoJsonLayer, PathLayer, ScatterplotLayer, SolidPolygonLayer, TripsLayer, MapView as DeckMapView, _GlobeView as GlobeView, WebMercatorViewport, type MapViewState, type GlobeViewState, type Viewport } from 'deck.gl'
import { loadLand } from './land'
import type { Hop, Port } from './flights'

type RGBA = [number, number, number, number]
const INK: RGBA = [20, 20, 20, 255], RED: RGBA = [214, 60, 32, 255], STOCK: RGBA = [239, 230, 210, 255], LAND: RGBA = [233, 223, 200, 255]
// Ports and labels sit on the sheet but must not be hidden by the raised arcs.
const FLAT = { depthCompare: 'always' as const, depthWriteEnabled: false }

/** Great circle lifted into a parabola (metres) so the routes stand off the sheet. */
function sky(a: [number, number], b: [number, number], lift: number, n = 48): [number, number, number][] {
  const r = Math.PI / 180, [l1, f1, l2, f2] = [a[0] * r, a[1] * r, b[0] * r, b[1] * r]
  const d = 2 * Math.asin(Math.sqrt(Math.sin((f2 - f1) / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin((l2 - l1) / 2) ** 2))
  const alt = 6371e3 * d * lift, out: [number, number, number][] = []
  for (let i = 0; i <= n; i++) {
    const f = i / n, A = d < 1e-9 ? 1 - f : Math.sin((1 - f) * d) / Math.sin(d), B = d < 1e-9 ? f : Math.sin(f * d) / Math.sin(d)
    const x = A * Math.cos(f1) * Math.cos(l1) + B * Math.cos(f2) * Math.cos(l2), y = A * Math.cos(f1) * Math.sin(l1) + B * Math.cos(f2) * Math.sin(l2), z = A * Math.sin(f1) + B * Math.sin(f2)
    out.push([Math.atan2(y, x) / r, Math.atan2(z, Math.hypot(x, y)) / r, alt * 4 * f * (1 - f)])
  }
  return out
}
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
// The sea as many small quads: one big polygon would project as two flat triangles, not a sphere.
const OCEAN = (() => {
  const q: [number, number][][] = []
  for (let x = -180; x < 180; x += 10) for (let y = -90; y < 90; y += 10) q.push([[x, y], [x + 10, y], [x + 10, y + 10], [x, y + 10]])
  return q
})()
const GRID = (() => {
  const g: [number, number][][] = []
  for (let lng = -180; lng < 180; lng += 15) g.push(Array.from({ length: 13 }, (_, i) => [lng, -90 + i * 15] as [number, number]))
  for (let lat = -75; lat <= 75; lat += 15) g.push(Array.from({ length: 49 }, (_, i) => [-180 + i * 7.5, lat] as [number, number]))
  return g
})()

type Props = { hops: Hop[]; ports: Port[]; mode?: 'globe' | 'region'; height?: number; className?: string }
/**
 * Globe: the whole record on a turning earth, ink ocean and cream land, routes raised off it.
 * Region: a flat poster panel fitted to one cluster of airports, every name printed.
 */
export function FlightMap({ hops, ports, mode = 'region', height = 520, className = '' }: Props) {
  const globe = mode === 'globe'
  const [geo, setGeo] = useState<GeoJSON.FeatureCollection | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const deckRef = useRef<React.ComponentRef<typeof DeckGL>>(null)
  const fitPasses = useRef(0)
  const [view, setView] = useState<MapViewState | GlobeViewState | null>(null)
  useEffect(() => { loadLand().then(setGeo) }, [])
  const routes = useMemo(() => hops.map((h, i) => ({ ...h, path: sky(h.s, h.t, globe ? 0.12 : 0.18), ts: Array.from({ length: 49 }, (_, k) => k / 48 + ((i * 0.37) % 1)) })), [hops, globe])
  const [t, setT] = useState(0)
  useEffect(() => {
    if (REDUCED) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => { setT((now - start) / 1000); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  const maxN = hops.reduce((m, h) => Math.max(m, h.n), 1)

  useEffect(() => {
    if (!ports.length) return
    const lngs = ports.map((p) => p.p[0]), lats = ports.map((p) => p.p[1])
    const w = ref.current?.clientWidth ?? 1000, h = ref.current?.clientHeight ?? height
    if (globe) {
      // Face the centre of mass of every flight (endpoints weighted by times flown) so most routes are on the lit side; sized so the earth fills the sheet's shorter side.
      const r = Math.PI / 180
      let x = 0, y = 0, z = 0
      for (const h of hops) for (const [lng, lat] of [h.s, h.t]) { x += h.n * Math.cos(lat * r) * Math.cos(lng * r); y += h.n * Math.cos(lat * r) * Math.sin(lng * r); z += h.n * Math.sin(lat * r) }
      const c = hops.length ? [Math.atan2(y, x) / r, Math.atan2(z, Math.hypot(x, y)) / r] : ports[0].p
      setView({ longitude: c[0], latitude: Math.max(-30, Math.min(30, c[1])), zoom: 1, minZoom: 0, maxZoom: 5 })
      fitPasses.current = 4
      return
    }
    const vp = new WebMercatorViewport({ width: w, height: h }).fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: w > 700 ? 90 : 48 })
    setView({ longitude: vp.longitude, latitude: vp.latitude, zoom: Math.min(vp.zoom, 5.5), pitch: 30, bearing: 0, minZoom: 0, maxZoom: 9, minPitch: 0, maxPitch: 60 })
  }, [ports, hops, height, globe])

  const wide = (ref.current?.clientWidth ?? 1000) > 700
  // Labels are HTML tags projected through the live viewport; a tag that would overlap one already placed slides to another side of its dot.
  let vp: Viewport | undefined
  try { vp = deckRef.current?.deck?.getViewports()[0] } catch { /* deck has not laid out yet; tags arrive next frame */ }
  // Deck's globe radius is not a plain function of zoom (perspective), so measure it and nudge the zoom a few frames until the earth fills 96% of the sheet's short side.
  useEffect(() => {
    if (!globe || !fitPasses.current || !vp || !view) return
    const c = vp.project([view.longitude, 0]), e = vp.project([view.longitude + 90, 0])
    const r = Math.hypot(e[0] - c[0], e[1] - c[1])
    if (!r) return
    const ratio = (0.48 * Math.min(vp.width, vp.height)) / r
    fitPasses.current = Math.abs(ratio - 1) < 0.01 ? 0 : fitPasses.current - 1
    if (Math.abs(ratio - 1) >= 0.01) setView((v) => v && { ...v, zoom: v.zoom + Math.log2(ratio) })
  }, [globe, vp, view])
  const tags = useMemo(() => {
    if (!view || !vp) return []
    const size = wide ? 12 : 11, row = size + 14
    const kept: { x: number; y: number; w: number }[] = [], out: { key: string; name: string; x: number; y: number; end: boolean }[] = []
    const r = Math.PI / 180, lat0 = view.latitude * r, lng0 = view.longitude * r
    for (const p of ports) {
      if (!p.name) continue
      // On the globe, skip airports past the horizon.
      if (globe && Math.sin(lat0) * Math.sin(p.p[1] * r) + Math.cos(lat0) * Math.cos(p.p[1] * r) * Math.cos(p.p[0] * r - lng0) < 0.25) continue
      const [x, y] = vp.project(p.p), tw = p.name.length * size * 0.66 + 16
      const slots = [
        { dx: 12, dy: 0, end: false }, { dx: -12, dy: 0, end: true },
        { dx: 12, dy: -row, end: false }, { dx: 12, dy: row, end: false },
        { dx: -12, dy: -row, end: true }, { dx: -12, dy: row, end: true },
      ].map((sl) => ({ ...sl, bx: sl.end ? x + sl.dx - tw : x + sl.dx, by: y + sl.dy }))
      const inside = (sl: { bx: number; by: number }) => sl.bx >= 4 && sl.bx + tw <= vp.width - 4 && sl.by >= row && sl.by <= vp.height - row
      const free = slots.find((sl) => inside(sl) && !kept.some((b) => sl.bx < b.x + b.w && sl.bx + tw > b.x && Math.abs(sl.by - b.y) < row))
      // The globe is the overview: a name with no room waits for its regional panel. Regions print every name on desktop; phones drop collisions.
      if (!free && (globe || !wide)) continue
      const sl = free ?? slots[0]
      kept.push({ x: sl.bx, y: sl.by, w: tw }); out.push({ key: p.p.join(), name: p.name, x: x + sl.dx, y: sl.by, end: sl.end })
    }
    return out
  }, [ports, wide, view, globe, vp])

  const layers = [
    globe && new SolidPolygonLayer({ id: 'ocean', data: OCEAN, getPolygon: (d) => d, getFillColor: [20, 20, 20, 255] }),
    new PathLayer({ id: 'graticule', data: GRID, getPath: (d) => d, getColor: globe ? [239, 230, 210, 40] : [20, 20, 20, 22], getWidth: 1, widthUnits: 'pixels', wrapLongitude: !globe }),
    geo && new GeoJsonLayer({ id: 'land', data: geo, filled: true, stroked: true, wrapLongitude: !globe, getFillColor: LAND, getLineColor: globe ? [20, 20, 20, 160] : [20, 20, 20, 110], lineWidthMinPixels: 0.9 }),
    new PathLayer<(typeof routes)[number]>({
      id: 'hop-shadows', data: routes, getPath: (d) => d.path.map(([x, y]) => [x, y, 0] as [number, number, number]), getColor: [20, 20, 20, globe ? 70 : 30], getWidth: 1.2, widthUnits: 'pixels',
    }),
    new PathLayer<(typeof routes)[number]>({
      id: 'hops', data: routes, getPath: (d) => d.path, getColor: RED,
      getWidth: (d) => 1.8 + (2.6 * d.n) / maxN, widthUnits: 'pixels', jointRounded: true, capRounded: true,
    }),
    new ScatterplotLayer<Port>({
      id: 'ports', data: ports, getPosition: (d) => d.p, radiusMinPixels: 4, radiusMaxPixels: 11, getRadius: (d) => 20000 * Math.sqrt(d.n),
      getFillColor: STOCK, stroked: true, getLineColor: INK, lineWidthMinPixels: 2.5, parameters: FLAT,
    }),
    !REDUCED && new TripsLayer<(typeof routes)[number]>({
      id: 'pulses', data: routes, getPath: (d) => d.path, getTimestamps: (d) => d.ts, currentTime: (t / 7) % 2, trailLength: 0.16, fadeTrail: true,
      getColor: [233, 181, 49, 255], getWidth: (d) => 3 + (2.6 * d.n) / maxN, widthUnits: 'pixels', capRounded: true,
    }),
  ].filter(Boolean)
  return (
    <div ref={ref} className={`flightmap ${mode} ${className}`} style={{ height }} aria-label={`${hops.length} flight routes between ${ports.length} airports`}>
      {view && (
        <DeckGL ref={deckRef} views={globe ? new GlobeView({ resolution: 10 }) : new DeckMapView({ repeat: false })} viewState={view} onViewStateChange={(e) => { setView(e.viewState as MapViewState) }}
          controller={{ scrollZoom: globe, dragRotate: !globe, touchRotate: !globe, keyboard: false, inertia: 300 }} layers={layers} style={{ position: 'absolute', inset: '0' }}
          getCursor={({ isDragging }) => (isDragging ? 'grabbing' : 'grab')} />
      )}
      <div className="tags" aria-hidden>
        {tags.map((g) => <span key={g.key} className={g.end ? 'end' : ''} style={{ left: g.x, top: g.y }}>{g.name}</span>)}
      </div>
      <span className="hint">{globe ? 'Drag to turn · scroll to zoom' : 'Drag to orbit'}</span>
    </div>
  )
}
