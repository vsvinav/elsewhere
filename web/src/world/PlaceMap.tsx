import { APIProvider, Map } from '@vis.gl/react-google-maps'
import { MapLoad } from '../usage/Meter'
import { useSettings } from '../ingest/settings'
import { MAP_STYLES } from '../map/style'
import type { Place } from '../data/types'

/** One stop, zoomed to its streets on poster stock with the red stamp over it; a static sheet, not a tool. */
export function PlaceMap({ place, height = 360 }: { place: Place; height?: number }) {
  const { mapsKey } = useSettings()
  return (
    <div className="placemap" style={{ height }} aria-label={`Map of ${place.name ?? place.label ?? 'this place'}`}>
      {mapsKey ? (
        <APIProvider apiKey={mapsKey}>
          <Map style={{ position: 'absolute', inset: 0 }} center={{ lat: place.lat, lng: place.lng }} zoom={15} styles={MAP_STYLES}
            disableDefaultUI gestureHandling="none" keyboardShortcuts={false} clickableIcons={false}><MapLoad /></Map>
        </APIProvider>
      ) : <div className="nokey">Add a Google Maps key under Tour → Backstage to print this map</div>}
      <i className="stamp-ring" />
    </div>
  )
}
