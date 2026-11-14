import { DeckGL } from 'deck.gl'
import { Map } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useData } from '../data/DataContext'
import { useStore } from '../store/useStore'
import { insightById } from '../insights/registry'

const STYLES = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/positron',
}

export function MapView() {
  const data = useData()
  const state = useStore()
  const insight = insightById[state.activeInsight]
  const layers = insight ? insight.layers(data, state) : []
  const home = data.profile.home
  return (
    <DeckGL
      initialViewState={{ longitude: home.lng, latitude: home.lat, zoom: 11, pitch: 0, bearing: 0 }}
      controller
      layers={layers}
      getTooltip={({ object }) => {
        if (!object || !('place_id' in object)) return null
        const p = data.places[object.place_id]
        return p ? `${p.name ?? p.city ?? object.place_id}\n${p.n_visits} visits` : null
      }}
    >
      <Map mapStyle={STYLES[state.basemap]} reuseMaps />
    </DeckGL>
  )
}
