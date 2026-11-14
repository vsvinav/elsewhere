import { useEffect, useMemo, useRef, useState } from 'react'
import { DeckGL, ArcLayer, GeoJsonLayer, ScatterplotLayer, TextLayer, MapView as DeckMapView, WebMercatorViewport, type MapViewState } from 'deck.gl'
import { feature } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { Data } from '../data/types'
import { flights, type Hop, type Port } from './flights'


type RGBA = [number, number, number, number]
const INK: RGBA = [20, 20, 20, 255], RED: RGBA = [214, 60, 32, 255], STOCK: RGBA = [239, 230, 210, 255]

// Ports and labels sit on the sheet but must not be hidden by the raised arcs.
const FLAT = { depthCompare: 'always' as const, depthWriteEnabled: false }

let land: Promise<GeoJSON.FeatureCollection> | null = null
// Countries rather than land so Antarctica (id 010) can be dropped: under a tilt its polygon smears across the sheet.
const loadLand = () => (land ??= import('world-atlas/countries-110m.json').then((m) => {
  const topo = (m.default ?? m) as unknown as Topology<{ countries: GeometryCollection }>
  const fc = feature(topo, topo.objects.countries) as GeoJSON.FeatureCollection
  return { ...fc, features: fc.features.filter((f) => f.id !== '010') }
}))

/** Flights as raised great-circle arcs over a cream relief; the camera tilts and the visitor can orbit it. */
export function FlightMap({ data, height = 520, fill = false }: { data: Data; height?: number; fill?: boolean }) {
  const { hops, ports } = useMemo(() => flights(data), [data])
  const [geo, setGeo] = useState<GeoJSON.FeatureCollection | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<MapViewState | null>(null)
  useEffect(() => { loadLand().then(setGeo) }, [])
  // Fit every airport once we know our width, then tilt.
  useEffect(() => {
    const el = ref.current
    if (!el || !ports.length) return
    const w = el.clientWidth || 1000, h = el.clientHeight || height
    const lngs = ports.map((p) => p.p[0]), lats = ports.map((p) => p.p[1])
    const vp = new WebMercatorViewport({ width: w, height: h }).fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: w > 700 ? { top: 60, bottom: fill ? 200 : 40, left: 60, right: 120 } : { top: 100, bottom: fill ? h * 0.5 : 24, left: 24, right: 24 } })
    // Under pitch the ground sits low on a tall phone; aim the camera south so the routes clear the stub.
    setView({ longitude: vp.longitude, latitude: vp.latitude - (fill && w <= 700 ? 22 : 0), zoom: Math.min(vp.zoom, 5) - 0.25, pitch: w > 700 ? 48 : 35, bearing: -8, minZoom: 0, maxZoom: 8, minPitch: 0, maxPitch: 65 })
  }, [ports, height, fill])
  const wide = (ref.current?.clientWidth ?? 1000) > 700
  // Busiest airport wins its patch of sheet; boxes are measured in pixels at the current zoom.
  const labelled = useMemo(() => {
    if (!wide || !view) return []
    const k = (256 * 2 ** view.zoom) / 360
    const px = (p: Port) => [p.p[0] * k, -Math.log(Math.tan(Math.PI / 4 + (p.p[1] * Math.PI) / 360)) * (180 / Math.PI) * k]
    const kept: { x: number; y: number; w: number }[] = [], out: Port[] = []
    for (const p of ports) {
      if (!p.name) continue
      const [x, y] = px(p), w = p.name.length * 9 + 24
      if (kept.some((b) => x < b.x + b.w && x + w > b.x && Math.abs(y - b.y) < 20)) continue
      kept.push({ x, y, w }); out.push(p)
    }
    return out.slice(0, 14)
  }, [ports, wide, view?.zoom])
  const maxN = hops.reduce((m, h) => Math.max(m, h.n), 1)
  const layers = [
    geo && new GeoJsonLayer({ id: 'land', data: geo, filled: true, stroked: true, wrapLongitude: true, getFillColor: [233, 223, 200, 255], getLineColor: [196, 186, 160, 255], lineWidthMinPixels: 0.8 }),
    // Ground shadow first, then the route: the gap between them is what reads as height.
    new ArcLayer<Hop>({
      id: 'hop-shadows', data: hops, greatCircle: true, numSegments: 60,
      getSourcePosition: (d) => d.s, getTargetPosition: (d) => d.t,
      getSourceColor: [20, 20, 20, 26], getTargetColor: [20, 20, 20, 26], getWidth: 1.5, widthUnits: 'pixels', getHeight: 0,
    }),
    new ArcLayer<Hop>({
      id: 'hops', data: hops, greatCircle: true, numSegments: 80,
      getSourcePosition: (d) => d.s, getTargetPosition: (d) => d.t,
      getSourceColor: RED, getTargetColor: [150, 38, 20, 255],
      getWidth: (d) => 1.6 + (2.4 * d.n) / maxN, widthUnits: 'pixels', getHeight: 0.5,
    }),
    new ScatterplotLayer<Port>({
      id: 'ports', data: ports, getPosition: (d) => d.p, radiusMinPixels: 4, radiusMaxPixels: 11, getRadius: (d) => 20000 * Math.sqrt(d.n),
      getFillColor: STOCK, stroked: true, getLineColor: INK, lineWidthMinPixels: 2.5, parameters: FLAT,
    }),
    new TextLayer<Port>({
      id: 'port-labels', data: labelled, getPosition: (d) => d.p, getText: (d) => d.name.toUpperCase(),
      getColor: INK, getSize: 13, fontFamily: '"Archivo Variable", Archivo, sans-serif', fontWeight: 700,
      fontSettings: { sdf: true, buffer: 3 }, outlineWidth: 3, outlineColor: [239, 230, 210, 240], getTextAnchor: 'start', getAlignmentBaseline: 'center', getPixelOffset: [12, 0],
      characterSet: 'auto', parameters: FLAT,
    }),
  ].filter(Boolean)
  return (
    <div ref={ref} className={`flightmap ${fill ? 'fill' : ''}`} style={fill ? undefined : { height }} aria-label={`${hops.length} flight routes between ${ports.length} airports`}>
      {view && (
        <DeckGL views={new DeckMapView({ repeat: false })} viewState={view} onViewStateChange={(e) => setView(e.viewState as MapViewState)}
          controller={{ scrollZoom: fill, dragRotate: true, touchRotate: true, keyboard: false }} layers={layers} style={{ position: 'absolute', inset: '0' }}
          getCursor={({ isDragging }) => (isDragging ? 'grabbing' : 'grab')} />
      )}
      <span className="hint">Drag to orbit</span>
    </div>
  )
}
