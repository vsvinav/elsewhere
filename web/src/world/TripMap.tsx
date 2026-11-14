import { useEffect } from 'react'
import { APIProvider, Map, useMap } from '@vis.gl/react-google-maps'
import { MapLoad } from '../usage/Meter'
import { useSettings } from '../ingest/settings'
import { MAP_STYLES } from '../map/style'
import type { Data } from '../data/types'

const RED = '#d63c20', INK = '#141414'

function Route({ data, range }: { data: Data; range: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    if (!map) return
    const [r0, r1] = range
    const b = new google.maps.LatLngBounds()
    const lines: google.maps.Polyline[] = []
    for (const p of data.strokes) if (p.end >= r0 && p.start <= r1) {
      const path = p.pts.filter((_, i) => i % 3 === 0).map(([, lat, lng]) => ({ lat, lng }))
      path.forEach((q) => b.extend(q))
      lines.push(new google.maps.Polyline({ path, strokeColor: RED, strokeOpacity: 0.9, strokeWeight: 3, map }))
    }
    for (const a of data.activities) if (a.mode === 'FLYING' && a.start >= r0 && a.start <= r1 && a.m > 80_000) {
      const path = [{ lat: a.s_lat, lng: a.s_lng }, { lat: a.e_lat, lng: a.e_lng }]
      path.forEach((q) => b.extend(q))
      lines.push(new google.maps.Polyline({ path, geodesic: true, strokeColor: INK, strokeOpacity: 0, strokeWeight: 2, map, icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: INK, scale: 2 }, offset: '0', repeat: '10px' }] }))
    }
    for (const v of data.visits) if (v.lvl === 0 && v.start >= r0 && v.start <= r1) b.extend({ lat: v.lat, lng: v.lng })
    if (!b.isEmpty()) map.fitBounds(b, 40)
    return () => lines.forEach((l) => l.setMap(null))
  }, [map, data, range])
  return null
}

/** One trip's route printed on the stock: red roads, dotted black flights, fit to where you went. */
export function TripMap({ data, range, height = 300 }: { data: Data; range: [number, number]; height?: number }) {
  const { mapsKey } = useSettings()
  return (
    <div className="placemap" style={{ height, marginTop: 24 }} aria-label="Map of this trip">
      {mapsKey ? (
        <APIProvider apiKey={mapsKey}>
          <Map style={{ position: 'absolute', inset: 0 }} defaultCenter={{ lat: 0, lng: 0 }} defaultZoom={3} styles={MAP_STYLES} disableDefaultUI gestureHandling="cooperative" keyboardShortcuts={false} clickableIcons={false}>
            <Route data={data} range={range} />
            <MapLoad />
          </Map>
        </APIProvider>
      ) : <div className="nokey">Add a Google Maps key under Tour → Backstage to print this map</div>}
    </div>
  )
}
