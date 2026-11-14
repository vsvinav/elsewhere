import { useEffect, useMemo } from 'react'
import { APIProvider, Map, useMap } from '@vis.gl/react-google-maps'
import { GoogleMapsOverlay } from '@deck.gl/google-maps'
import { useData } from '../data/DataContext'
import { useStore } from '../store/useStore'
import { positionAt } from '../analytics/position'
import { denseBounds } from '../analytics/geo'
import { mapLayers } from './layers'
import { useSettings } from '../ingest/settings'
import { useFollow } from './useFollow'
import { Field, Pass } from '../world'
import { MAP_STYLES } from './style'

// A Map ID switches Google to the vector renderer (smooth fractional zoom, far less tile memory); its style then lives in Cloud Console.

function Deck() {
  const map = useMap()
  const data = useData()
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
    return () => { l.remove(); overlay.finalize() }
  }, [map, overlay])
  const tab = useStore((s) => s.tab)
  // Layers update straight from the store on an animation frame; React never renders for the playhead.
  useEffect(() => {
    if (!map) return
    let raf = 0
    const render = () => {
      raf = 0
      const s = useStore.getState()
      const now = s.playhead ?? data.meta.range[0]
      overlay.setProps({ layers: mapLayers(data, now, s.rate, s.playing, s.tab === 'map' ? Infinity : now, map.getZoom() ?? 10, s.lens) })
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(render) }
    render()
    const unsub = useStore.subscribe(schedule)
    const zl = map.addListener('zoom_changed', schedule)
    return () => { unsub(); zl.remove(); cancelAnimationFrame(raf) }
  }, [map, overlay, data])
  useFollow()
  // Map tab opens on the whole record; Play follows the playhead.
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
  const { mapsKey: KEY, mapId: MAP_ID } = useSettings()
  const start = useMemo(() => positionAt(data, useStore.getState().playhead ?? data.meta.range[0]) ?? data.profile.home, [data])
  if (!KEY) {
    return (
      <main className="strip">
        <Pass stripe share={false}><div className="fields"><Field label="Map">Missing Google Maps key</Field><Field label="Fix">Add your key under Home → Your record</Field></div></Pass>
      </main>
    )
  }
  return (
    <APIProvider apiKey={KEY}>
      <Map
        key={MAP_ID}
        style={{ position: 'absolute', inset: 0 }}
        defaultCenter={{ lat: start.lat, lng: start.lng }}
        defaultZoom={12}
        {...(MAP_ID ? { mapId: MAP_ID, renderingType: 'VECTOR' as const } : { styles: MAP_STYLES })}
        backgroundColor="#efe6d2"
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
