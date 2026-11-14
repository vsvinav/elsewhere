import { useEffect } from 'react'
import { APIProvider, Map, useMap } from '@vis.gl/react-google-maps'
import { MapLoad } from '../usage/Meter'
import { useSettings } from '../ingest/settings'
import { MAP_STYLES } from '../map/style'
import { markGoogleDown, useProvider } from '../map/provider'
import { LibreMap, useLibre } from '../map/osm/Libre'
import type { Data } from '../data/types'

const RED = '#d63c20', INK = '#141414'

type Pt = { lat: number; lng: number }
/** Roads driven, long flights, and stops in the range, plus the box that holds them all. */
function geometry(data: Data, [r0, r1]: [number, number]) {
  const roads: Pt[][] = [], flights: Pt[][] = [], pts: Pt[] = []
  for (const p of data.strokes) if (p.end >= r0 && p.start <= r1) {
    const path = p.pts.filter((_, i) => i % 3 === 0).map(([, lat, lng]) => ({ lat, lng }))
    roads.push(path); pts.push(...path)
  }
  for (const a of data.activities) if (a.mode === 'FLYING' && a.start >= r0 && a.start <= r1 && a.m > 80_000) {
    const path = [{ lat: a.s_lat, lng: a.s_lng }, { lat: a.e_lat, lng: a.e_lng }]
    flights.push(path); pts.push(...path)
  }
  for (const v of data.visits) if (v.lvl === 0 && v.start >= r0 && v.start <= r1) pts.push({ lat: v.lat, lng: v.lng })
  const sw: [number, number] = [Math.min(...pts.map((q) => q.lng)), Math.min(...pts.map((q) => q.lat))]
  const ne: [number, number] = [Math.max(...pts.map((q) => q.lng)), Math.max(...pts.map((q) => q.lat))]
  return { roads, flights, box: pts.length ? { sw, ne } : null }
}

function Route({ data, range }: { data: Data; range: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    if (!map) return
    const g = geometry(data, range)
    const lines = [
      ...g.roads.map((path) => new google.maps.Polyline({ path, strokeColor: RED, strokeOpacity: 0.9, strokeWeight: 3, map })),
      ...g.flights.map((path) => new google.maps.Polyline({ path, geodesic: true, strokeColor: INK, strokeOpacity: 0, strokeWeight: 2, map, icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: INK, scale: 2 }, offset: '0', repeat: '10px' }] })),
    ]
    if (g.box) map.fitBounds(new google.maps.LatLngBounds({ lng: g.box.sw[0], lat: g.box.sw[1] }, { lng: g.box.ne[0], lat: g.box.ne[1] }), 40)
    return () => lines.forEach((l) => l.setMap(null))
  }, [map, data, range])
  return null
}

function LibreRoute({ data, range }: { data: Data; range: [number, number] }) {
  const map = useLibre()
  useEffect(() => {
    if (!map) return
    const g = geometry(data, range)
    const line = (paths: Pt[][]): GeoJSON.Feature => ({ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: paths.map((p) => p.map((q) => [q.lng, q.lat])) } })
    map.addSource('roads', { type: 'geojson', data: line(g.roads) })
    map.addSource('flights', { type: 'geojson', data: line(g.flights) })
    map.addLayer({ id: 'roads', type: 'line', source: 'roads', paint: { 'line-color': RED, 'line-width': 3, 'line-opacity': 0.9 } })
    map.addLayer({ id: 'flights', type: 'line', source: 'flights', paint: { 'line-color': INK, 'line-width': 2, 'line-dasharray': [1, 4] } })
    if (g.box) map.fitBounds([g.box.sw, g.box.ne], { padding: 40, duration: 0 })
    return () => { for (const id of ['roads', 'flights']) { if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(id)) map.removeSource(id) } }
  }, [map, data, range])
  return null
}

/** One trip's route printed on the stock: red roads, dotted black flights, fit to where you went. */
export function TripMap({ data, range, height = 300 }: { data: Data; range: [number, number]; height?: number }) {
  const { mapsKey } = useSettings()
  const provider = useProvider()
  return (
    <div className="placemap" style={{ height, marginTop: 24 }} aria-label="Map of this trip">
      {provider === 'osm' ? <LibreMap center={{ lat: 0, lng: 0 }} zoom={3}><LibreRoute data={data} range={range} /></LibreMap> : (
        <APIProvider apiKey={mapsKey} onError={markGoogleDown}>
          <Map style={{ position: 'absolute', inset: 0 }} defaultCenter={{ lat: 0, lng: 0 }} defaultZoom={3} styles={MAP_STYLES} disableDefaultUI gestureHandling="cooperative" keyboardShortcuts={false} clickableIcons={false}>
            <Route data={data} range={range} />
            <MapLoad />
          </Map>
        </APIProvider>
      )}
    </div>
  )
}
