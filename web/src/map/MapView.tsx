import { useEffect, useMemo, useState } from 'react'
import { APIProvider, Map, useMap } from '@vis.gl/react-google-maps'
import { GoogleMapsOverlay } from '@deck.gl/google-maps'
import { MapLibreOverlay } from '@deck.gl/maplibre'
import type { Layer } from 'deck.gl'
import { MapLoad } from '../usage/Meter'
import { useData } from '../data/DataContext'
import { useStore } from '../store/useStore'
import { positionAt } from '../analytics/position'
import { mapLayers, pinLayers } from './layers'
import { liveCam } from './live'
import { useSettings } from '../ingest/settings'
import { useFollow } from './useFollow'
import { MAP_STYLES } from './style'
import { googleCam, libreCam, type Cam } from './cam'
import { markGoogleDown, useProvider } from './provider'
import { LibreMap, useLibre } from './osm/Libre'

// A Map ID switches Google to the vector renderer (smooth fractional zoom, far less tile memory); its style then lives in Cloud Console.

interface Overlay { setProps(p: { layers: Layer[] }): void }

const onHover = (info: { object?: unknown; x: number; y: number }) => {
  const o = info.object as { id: string } | undefined
  useStore.getState().setHoverPlace(o ? { id: o.id, x: info.x, y: info.y } : null)
}
const onClick = (info: { object?: unknown }) => {
  if (useStore.getState().tab !== 'map') return
  const o = info.object as { id?: string; items?: unknown[]; lng: number; lat: number } | undefined
  const cam = liveCam.get()
  if (o?.items && cam) { cam.move({ lng: o.lng, lat: o.lat }, Math.min(18, cam.zoom() + 2.5)); return }
  useStore.getState().setPin(o?.id ?? null)
}

/** Layers update straight from the store on an animation frame; React never renders for the playhead. Map tab opens on the whole record; Play follows the playhead. */
function useDeck(cam: Cam | null, overlay: Overlay | null) {
  const data = useData()
  const tab = useStore((s) => s.tab)
  useEffect(() => {
    if (!cam || !overlay) return
    let raf = 0
    const render = () => {
      raf = 0
      const s = useStore.getState()
      const now = s.playhead ?? data.meta.range[0]
      overlay.setProps({ layers: s.tab === 'map' ? pinLayers(data, cam.zoom(), { hidden: s.hiddenCats, selected: s.pin, sizeBy: s.pinSize }) : mapLayers(data, now, s.rate, s.playing, now, cam.zoom(), s.lens) })
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(render) }
    render()
    const unsub = useStore.subscribe(schedule)
    const off = cam.on('move', schedule)
    return () => { unsub(); off(); cancelAnimationFrame(raf) }
  }, [cam, overlay, data])
  useFollow(cam)
  useEffect(() => { liveCam.set(cam); return () => liveCam.set(null) }, [cam])
  // The Map tab frames its pins from PinHud; here only stop the replay camera from following.
  useEffect(() => { if (cam && tab === 'map') useStore.getState().setFollow(false) }, [cam, tab])
}

function GoogleDeck() {
  const map = useMap()
  const cam = useMemo(() => (map ? googleCam(map) : null), [map])
  const overlay = useMemo(() => new GoogleMapsOverlay({ onHover, onClick }), [])
  // Google may fall back from vector to raster after load; (re)attach deck once the type is settled.
  useEffect(() => {
    if (!map) return
    const attach = () => { overlay.setMap(null); if (map.getRenderingType() !== 'UNINITIALIZED') overlay.setMap(map) }
    attach()
    const l = map.addListener('renderingtype_changed', attach)
    return () => { l.remove(); overlay.finalize() }
  }, [map, overlay])
  useDeck(cam, overlay)
  return null
}

function LibreDeck() {
  const map = useLibre()
  const cam = useMemo(() => (map ? libreCam(map) : null), [map])
  const [overlay, setOverlay] = useState<MapLibreOverlay | null>(null)
  useEffect(() => {
    if (!map) return
    const o = new MapLibreOverlay({ interleaved: false, onHover, onClick })
    map.addControl(o)
    setOverlay(o)
    return () => { setOverlay(null); if (map.hasControl(o)) map.removeControl(o) }
  }, [map])
  useDeck(cam, overlay)
  return null
}

export function MapView() {
  const data = useData()
  const { mapsKey: KEY, mapId: MAP_ID } = useSettings()
  const provider = useProvider()
  const start = useMemo(() => positionAt(data, useStore.getState().playhead ?? data.meta.range[0]) ?? data.profile.home, [data])
  if (provider === 'osm') {
    return <LibreMap center={start} zoom={12}><LibreDeck /></LibreMap>
  }
  return (
    <APIProvider apiKey={KEY} onError={markGoogleDown}>
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
        <GoogleDeck />
        <MapLoad />
      </Map>
    </APIProvider>
  )
}
