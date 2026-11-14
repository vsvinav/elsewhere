import { MapView } from './MapView'
import { Hud } from './Hud'
import { PinHud } from './Pins'
import { ArrivalTags, HoverTag } from './ArrivalTags'
import { useEffect } from 'react'
import { useStore } from '../store/useStore'
import { usePlayback } from './usePlayback'

/** Map and Play share one screen: Map pins every stop, Play runs the record along its trails. */
export function MapScreen() {
  usePlayback()
  const tab = useStore((s) => s.tab)
  useEffect(() => { useStore.getState().setPlaying(tab === 'play') }, [tab])
  return (
    <div className="screen">
      <MapView />
      {tab === 'map' ? <PinHud /> : <Hud />}
      {tab === 'play' && <ArrivalTags />}
      <HoverTag />
    </div>
  )
}
