import { useEffect, useMemo } from 'react'
import { APIProvider, Map, useMap } from '@vis.gl/react-google-maps'
import { GoogleMapsOverlay } from '@deck.gl/google-maps'
import { useData } from '../data/DataContext'
import { useStore } from '../store/useStore'
import { positionAt } from '../analytics/position'
import { denseBounds } from '../analytics/geo'
import { mapLayers } from './layers'
import { useFollow } from './useFollow'
import { Field, Pass } from '../world'
import { MAP_STYLES } from './style'

const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined

function Deck() {
  const map = useMap()
  const data = useData()
  const playhead = useStore((s) => s.playhead)
  const speed = useStore((s) => s.speed)
  const playing = useStore((s) => s.playing)
  const basemap = useStore((s) => s.basemap)
  const overlay = useMemo(() => new GoogleMapsOverlay({
    onHover: (info) => {
      const o = info.object as { id: string } | undefined
      useStore.getState().setHoverPlace(o ? { id: o.id, x: info.x, y: info.y } : null)
    },
  }), [])
  // Google may fall back from vector to raster after load; (re)attach deck once the type is settled.
  useEffect(() => {
    if (!map) return
    const attach = () => { overlay.setMap(null); if (map.getRenderingType() !== 'UNINITIALIZED') overlay.setMap(map) }
    attach()
    const l = map.addListener('renderingtype_changed', attach)
    return () => { l.remove(); overlay.setMap(null) }
  }, [map, overlay])
  useEffect(() => { overlay.setProps({ layers: mapLayers(data, playhead ?? data.meta.range[0], speed, playing, basemap) }) }, [overlay, data, playhead, speed, playing, basemap])
  useFollow()
  // Map tab opens on the whole record; Play follows the playhead.
  const tab = useStore((s) => s.tab)
  useEffect(() => {
    if (!map || tab !== 'map') return
    useStore.getState().setFollow(false)
    const b = denseBounds(data.visits.filter((v) => v.lvl === 0).map((v) => ({ lng: v.lng, lat: v.lat })))
    if (b) map.fitBounds(new google.maps.LatLngBounds({ lng: b[0][0], lat: b[0][1] }, { lng: b[1][0], lat: b[1][1] }), { top: 60, bottom: 220, left: 220, right: 60 })
  }, [map, tab, data])
  return null
}

export function MapView() {
  const data = useData()
  const basemap = useStore((s) => s.basemap)
  const start = useMemo(() => positionAt(data, useStore.getState().playhead ?? data.meta.range[0]) ?? data.profile.home, [data])
  if (!KEY) {
    return (
      <main className="strip">
        <Pass stripe><div className="fields"><Field label="Map">Missing Google Maps key</Field><Field label="Fix">Put VITE_GOOGLE_MAPS_KEY=… in web/.env.local and reload</Field></div></Pass>
      </main>
    )
  }
  return (
    <APIProvider apiKey={KEY}>
      <Map
        key={basemap}
        style={{ position: 'absolute', inset: 0 }}
        defaultCenter={{ lat: start.lat, lng: start.lng }}
        defaultZoom={12}
        styles={MAP_STYLES[basemap]}
        backgroundColor={basemap === 'dark' ? '#0b0c10' : '#f7f6f2'}
        disableDefaultUI
        gestureHandling="greedy"
        clickableIcons={false}
        isFractionalZoomEnabled
      >
        <Deck />
      </Map>
    </APIProvider>
  )
}
