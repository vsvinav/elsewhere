import { useEffect, useRef, useState } from 'react'
import { DeckGL, FlyToInterpolator, type MapViewState } from 'deck.gl'
import { Map } from 'react-map-gl/maplibre'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useData } from '../data/DataContext'
import { useStore } from '../store/useStore'
import { insightById } from '../insights/registry'
import { distanceKm, positionAt } from '../analytics/position'

// Vite's dev transform injects browser-only client code into maplibre's worker module,
// so serve a pristine copy from public/ (copied by the `postinstall` script).
maplibregl.setWorkerUrl('/vendor/maplibre-gl-worker.mjs')

const STYLES = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/positron',
}
const FOLLOW_INTERVAL_MS = 1200
const FOLLOW_TRIGGER_KM = 3

export function MapView() {
  const data = useData()
  const state = useStore()
  const insight = insightById[state.activeInsight]
  const layers = insight ? insight.layers(data, state) : []

  const start = positionAt(data, state.playhead ?? state.timeRange[0]) ?? data.profile.home
  const [view, setView] = useState<MapViewState>({ longitude: start.lng, latitude: start.lat, zoom: 11, pitch: 0, bearing: 0 })
  const lastFly = useRef(0)

  const now = state.playhead ?? state.timeRange[1]
  useEffect(() => {
    if (!state.follow) return
    const t = performance.now()
    if (t - lastFly.current < FOLLOW_INTERVAL_MS) return
    const pos = positionAt(data, now)
    if (!pos) return
    setView((v) => {
      const d = distanceKm(pos, { lng: v.longitude, lat: v.latitude })
      if (d < FOLLOW_TRIGGER_KM) return v
      lastFly.current = t
      // Far jumps (flights) zoom out so the whole hop reads; local moves keep the zoom.
      const zoom = d > 500 ? 5 : d > 60 ? 9 : Math.max(v.zoom, 10)
      return { ...v, longitude: pos.lng, latitude: pos.lat, zoom,
        transitionDuration: d > 500 ? 2500 : 1000, transitionInterpolator: new FlyToInterpolator({ speed: 1.5 }) }
    })
  }, [data, now, state.follow])

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
