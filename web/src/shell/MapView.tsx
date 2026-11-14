import { useEffect, useRef, useState } from 'react'
import { DeckGL, FlyToInterpolator, WebMercatorViewport, type MapViewState } from 'deck.gl'
import { Map } from 'react-map-gl/maplibre'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useData } from '../data/DataContext'
import { useStore } from '../store/useStore'
import { insightById } from '../insights/registry'
import { distanceKm, positionAt, whereaboutsAt, zoomForMode } from '../analytics/position'

// Vite's dev transform injects browser-only client code into maplibre's worker module,
// so serve a pristine copy from public/ (copied by the `postinstall` script).
maplibregl.setWorkerUrl('/vendor/maplibre-gl-worker.mjs')

const STYLES = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/positron',
}
const FOLLOW_INTERVAL_MS = 1200
const FOLLOW_TRIGGER_KM = 0.3
const ZOOM_TRIGGER = 0.75

export function MapView() {
  const data = useData()
  const state = useStore()
  const insight = insightById[state.activeInsight]
  const layers = insight ? insight.layers(data, state) : []

  const start = positionAt(data, state.playhead ?? state.timeRange[0]) ?? data.profile.home
  const [view, setView] = useState<MapViewState>({ longitude: start.lng, latitude: start.lat, zoom: 11, pitch: 0, bearing: 0 })
  const lastFly = useRef(0)

  const camera = state.camera
  useEffect(() => {
    if (!camera) return
    const vp = new WebMercatorViewport({ width: window.innerWidth, height: window.innerHeight })
    const [[x0, y0], [x1, y1]] = camera.bounds
    const tiny = Math.abs(x1 - x0) < 1e-6 && Math.abs(y1 - y0) < 1e-6
    const { longitude, latitude, zoom } = tiny
      ? { longitude: x0, latitude: y0, zoom: 14 }
      : vp.fitBounds(camera.bounds, { padding: { top: 120, bottom: 120, left: 420, right: 120 }, maxZoom: 15 })
    setView((v) => ({ ...v, longitude, latitude, zoom, transitionDuration: 1500, transitionInterpolator: new FlyToInterpolator({ speed: 1.2 }) }))
  }, [camera])

  const now = state.playhead ?? state.timeRange[1]
  const following = state.follow && state.activeInsight === 'replay'
  useEffect(() => {
    if (!following) return
    const t = performance.now()
    if (t - lastFly.current < FOLLOW_INTERVAL_MS) return
    const w = whereaboutsAt(data, now)
    if (!w) return
    setView((v) => {
      const d = distanceKm(w, { lng: v.longitude, lat: v.latitude })
      const zoom = zoomForMode(w.mode)
      if (d < FOLLOW_TRIGGER_KM && Math.abs(zoom - v.zoom) < ZOOM_TRIGGER) return v
      lastFly.current = t
      // Zoom follows how you're moving (walk = street level, flight = continent); far jumps fly slower.
      return { ...v, longitude: w.lng, latitude: w.lat, zoom,
        transitionDuration: d > 500 ? 2500 : 1000, transitionInterpolator: new FlyToInterpolator({ speed: 1.5 }) }
    })
  }, [data, now, following])

  return (
    <DeckGL
      viewState={view}
      onViewStateChange={({ viewState, interactionState }) => {
        setView(viewState as MapViewState)
        if (interactionState.isDragging || interactionState.isZooming || interactionState.isPanning) state.setFollow(false)
      }}
      controller
      layers={layers}
      getTooltip={({ object }) => {
        if (!object || !('place_id' in object)) return null
        const p = data.places[object.place_id]
        return p ? `${p.name ?? p.city ?? object.place_id}\n${p.n_visits} visits` : null
      }}
    >
      <Map mapLib={maplibregl} mapStyle={STYLES[state.basemap]} reuseMaps />
    </DeckGL>
  )
}
