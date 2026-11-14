import { MapView } from './MapView'
import { Hud } from './Hud'
import { Sky } from './Sky'
import { ArrivalTags, HoverTag } from './ArrivalTags'
import { useEffect } from 'react'
import { useStore } from '../store/useStore'
import { usePlayback } from './usePlayback'

/** Map and Play share one screen; Play is the same map with the playhead running. */
export function MapScreen() {
  usePlayback()
  const tab = useStore((s) => s.tab)
  useEffect(() => { useStore.getState().setPlaying(tab === 'play') }, [tab])
  return (
    <div className="screen">
      <MapView />
      <Sky />
      <Hud />
      <ArrivalTags />
      <HoverTag />
    </div>
  )
}
