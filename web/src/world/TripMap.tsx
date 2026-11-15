import { useEffect, useMemo, useRef } from 'react'
import { APIProvider, Map, useMap } from '@vis.gl/react-google-maps'
import { MapLoad } from '../usage/Meter'
import { useSettings } from '../ingest/settings'
import { MAP_STYLES } from '../map/style'
import { markGoogleDown, useProvider } from '../map/provider'
import { LibreMap, useLibre } from '../map/osm/Libre'
import type { GeoJSONSource } from 'maplibre-gl'
import type { Data } from '../data/types'

const RED = '#d63c20', INK = '#141414'

type Pt = { lat: number; lng: number }
interface Road { path: Pt[]; t: number[] }
interface Flight { path: [Pt, Pt]; start: number; end: number }
export interface RouteGeometry { roads: Road[]; flights: Flight[]; box: { sw: [number, number]; ne: [number, number] } | null }

/** Roads driven, long flights, and stops in the range, plus the box that holds them all. O(strokes + activities + visits). */
export function routeGeometry(data: Data, [r0, r1]: [number, number]): RouteGeometry {
  const roads: Road[] = [], flights: Flight[] = [], pts: Pt[] = []
  for (const p of data.strokes) if (p.end >= r0 && p.start <= r1) {
    const kept = p.pts.filter((_, i) => i % 3 === 0)
    const path = kept.map(([, lat, lng]) => ({ lat, lng }))
    roads.push({ path, t: kept.map(([t]) => t) }); pts.push(...path)
  }
  for (const a of data.activities) if (a.mode === 'FLYING' && a.start >= r0 && a.start <= r1 && a.m > 80_000) {
    const path: [Pt, Pt] = [{ lat: a.s_lat, lng: a.s_lng }, { lat: a.e_lat, lng: a.e_lng }]
    flights.push({ path, start: a.start, end: a.end }); pts.push(...path)
  }
  for (const v of data.visits) if (v.lvl === 0 && v.start >= r0 && v.start <= r1) pts.push({ lat: v.lat, lng: v.lng })
  const sw: [number, number] = [Math.min(...pts.map((q) => q.lng)), Math.min(...pts.map((q) => q.lat))]
  const ne: [number, number] = [Math.max(...pts.map((q) => q.lng)), Math.max(...pts.map((q) => q.lat))]
  return { roads, flights, box: pts.length ? { sw, ne } : null }
}

/** The part of the route travelled by `playhead`: roads cut at the last point passed, a flight in progress drawn to where it is. */
export function routeAt(g: RouteGeometry, playhead: number | undefined): { roads: Pt[][]; flights: Pt[][] } {
  if (playhead == null) return { roads: g.roads.map((r) => r.path), flights: g.flights.map((f) => f.path) }
  const roads: Pt[][] = [], flights: Pt[][] = []
  for (const r of g.roads) {
    let n = 0
    while (n < r.t.length && r.t[n] <= playhead) n++
    if (n >= 2) roads.push(n === r.path.length ? r.path : r.path.slice(0, n))
  }
  for (const f of g.flights) {
    if (f.start > playhead) continue
    if (f.end <= playhead) { flights.push(f.path); continue }
    const k = (playhead - f.start) / Math.max(1, f.end - f.start), [s, e] = f.path
    flights.push([s, { lat: s.lat + (e.lat - s.lat) * k, lng: s.lng + (e.lng - s.lng) * k }])
  }
  return { roads, flights }
}

const FLIGHT_ICON = [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: INK, scale: 2 }, offset: '0', repeat: '10px' }]

function Route({ data, range, playhead }: { data: Data; range: [number, number]; playhead?: number }) {
  const map = useMap()
  const g = useMemo(() => routeGeometry(data, range), [data, range])
  const lines = useRef<{ roads: google.maps.Polyline[]; flights: google.maps.Polyline[] }>({ roads: [], flights: [] })
  useEffect(() => {
    if (!map) return
    const l = lines.current
    l.roads = g.roads.map(() => new google.maps.Polyline({ path: [], strokeColor: RED, strokeOpacity: 0.9, strokeWeight: 3, map }))
    l.flights = g.flights.map(() => new google.maps.Polyline({ path: [], geodesic: true, strokeColor: INK, strokeOpacity: 0, strokeWeight: 2, map, icons: FLIGHT_ICON }))
    if (g.box) map.fitBounds(new google.maps.LatLngBounds({ lng: g.box.sw[0], lat: g.box.sw[1] }, { lng: g.box.ne[0], lat: g.box.ne[1] }), 40)
    return () => { [...l.roads, ...l.flights].forEach((x) => x.setMap(null)); l.roads = []; l.flights = [] }
  }, [map, g])
  // Each frame only moves paths; the polylines and the fit are made once per geometry.
  useEffect(() => {
    if (!map) return
    const seen = routeAt(g, playhead), l = lines.current
    l.roads.forEach((p, i) => p.setPath(seen.roads[i] ?? []))
    l.flights.forEach((p, i) => p.setPath(seen.flights[i] ?? []))
  }, [map, g, playhead])
  return null
}

function LibreRoute({ data, range, playhead }: { data: Data; range: [number, number]; playhead?: number }) {
  const map = useLibre()
  const g = useMemo(() => routeGeometry(data, range), [data, range])
  const line = (paths: Pt[][]): GeoJSON.Feature => ({ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: paths.map((p) => p.map((q) => [q.lng, q.lat])) } })
  useEffect(() => {
    if (!map) return
    map.addSource('roads', { type: 'geojson', data: line([]) })
    map.addSource('flights', { type: 'geojson', data: line([]) })
    map.addLayer({ id: 'roads', type: 'line', source: 'roads', paint: { 'line-color': RED, 'line-width': 3, 'line-opacity': 0.9 } })
    map.addLayer({ id: 'flights', type: 'line', source: 'flights', paint: { 'line-color': INK, 'line-width': 2, 'line-dasharray': [1, 4] } })
    if (g.box) map.fitBounds([g.box.sw, g.box.ne], { padding: 40, duration: 0 })
    return () => { for (const id of ['roads', 'flights']) { if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(id)) map.removeSource(id) } }
  }, [map, g])
  useEffect(() => {
    if (!map) return
    const seen = routeAt(g, playhead)
    ;(map.getSource('roads') as GeoJSONSource | undefined)?.setData(line(seen.roads))
    ;(map.getSource('flights') as GeoJSONSource | undefined)?.setData(line(seen.flights))
  }, [map, g, playhead])
  return null
}

/**
 * One trip's route printed on the stock: red roads, dotted black flights, fit to where you went.
 * With a `playhead`, only the part travelled by then is drawn; the fit stays on the whole trip.
 */
export function TripMap({ data, range, playhead, height = 300 }: { data: Data; range: [number, number]; playhead?: number; height?: number }) {
  const { mapsKey } = useSettings()
  const provider = useProvider()
  return (
    <div className="placemap" style={{ height, marginTop: 24 }} aria-label="Map of this trip">
      {provider === 'osm' ? <LibreMap center={{ lat: 0, lng: 0 }} zoom={3}><LibreRoute data={data} range={range} playhead={playhead} /></LibreMap> : (
        <APIProvider apiKey={mapsKey} onError={markGoogleDown}>
          <Map style={{ position: 'absolute', inset: 0 }} defaultCenter={{ lat: 0, lng: 0 }} defaultZoom={3} styles={MAP_STYLES} disableDefaultUI gestureHandling="cooperative" keyboardShortcuts={false} clickableIcons={false}>
            <Route data={data} range={range} playhead={playhead} />
            <MapLoad />
          </Map>
        </APIProvider>
      )}
    </div>
  )
}
