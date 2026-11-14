import { useEffect, useMemo } from 'react'
import { APIProvider, Map, useMap } from '@vis.gl/react-google-maps'
import { GoogleMapsOverlay } from '@deck.gl/google-maps'
import { useData } from '../data/DataContext'
import { useStore } from '../store/useStore'
import { insightById } from '../insights/registry'
import { positionAt } from '../analytics/position'
import { useCamera } from './useCamera'

const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined

function DeckOverlay() {
  const map = useMap()
  const data = useData()
  const state = useStore()
  const overlay = useMemo(() => new GoogleMapsOverlay({}), [])
  // Google may fall back from vector to raster after load; (re)attach deck once the type is settled.
  useEffect(() => {
    if (!map) return
    const attach = () => { overlay.setMap(null); if (map.getRenderingType() !== 'UNINITIALIZED') overlay.setMap(map) }
    attach()
    const l = map.addListener('renderingtype_changed', attach)
    return () => { l.remove(); overlay.setMap(null) }
  }, [map, overlay])
  const insight = insightById[state.activeInsight]
  const layers = insight ? insight.layers(data, state) : []
  useEffect(() => {
    if (!map) return
    overlay.setProps({
      layers,
      getTooltip: ({ object }) => {
        if (!object || !('place_id' in object)) return null
        const p = data.places[object.place_id]
        return p ? `${p.name ?? p.city ?? object.place_id}\n${p.n_visits} visits` : null
      },
    })
  })
  useCamera()
  return null
}

export function MapView() {
  const data = useData()
  const basemap = useStore((s) => s.basemap)
  const start = useMemo(() => positionAt(data, useStore.getState().timeRange[0]) ?? data.profile.home, [data])
  if (!KEY) {
    return <div className="fullscreen error"><h1>Missing Google Maps key</h1><p>Put <code>VITE_GOOGLE_MAPS_KEY=…</code> in <code>web/.env.local</code> and reload.</p></div>
  }
  return (
    <APIProvider apiKey={KEY}>
      <Map
        key={basemap}
        style={{ position: 'absolute', inset: 0 }}
        defaultCenter={{ lat: start.lat, lng: start.lng }}
        defaultZoom={12}
        mapId="DEMO_MAP_ID"
        renderingType="VECTOR"
        colorScheme={basemap === 'dark' ? 'DARK' : 'LIGHT'}
        disableDefaultUI
        gestureHandling="greedy"
        clickableIcons={false}
        isFractionalZoomEnabled
      >
        <DeckOverlay />
      </Map>
    </APIProvider>
  )
}
