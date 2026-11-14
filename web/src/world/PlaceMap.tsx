import { APIProvider, Map } from '@vis.gl/react-google-maps'
import { MapLoad } from '../usage/Meter'
import { useSettings } from '../ingest/settings'
import { MAP_STYLES } from '../map/style'
import { markGoogleDown, useProvider } from '../map/provider'
import { LibreMap } from '../map/osm/Libre'
import type { Place } from '../data/types'

/** One stop, zoomed to its streets on poster stock with the red stamp over it; a static sheet, not a tool. */
export function PlaceMap({ place, height = 360 }: { place: Place; height?: number }) {
  const { mapsKey } = useSettings()
  const provider = useProvider()
  return (
    <div className="placemap" style={{ height }} aria-label={`Map of ${place.name ?? place.label ?? 'this place'}`}>
      {provider === 'osm' ? <LibreMap center={{ lat: place.lat, lng: place.lng }} zoom={15} interactive={false} /> : (
        <APIProvider apiKey={mapsKey} onError={markGoogleDown}>
          <Map style={{ position: 'absolute', inset: 0 }} center={{ lat: place.lat, lng: place.lng }} zoom={15} styles={MAP_STYLES}
            disableDefaultUI gestureHandling="none" keyboardShortcuts={false} clickableIcons={false}><MapLoad /></Map>
        </APIProvider>
      )}
      <i className="stamp-ring" />
    </div>
  )
}
