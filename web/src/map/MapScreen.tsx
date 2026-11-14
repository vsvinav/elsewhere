import { useEffect } from 'react'
import { useStore } from '../store/useStore'
import { MapView } from './MapView'
import { Scrubber } from './Scrubber'
import { usePlayback } from './usePlayback'
import './legacy.css'

// shortcut: Map/Play reuse the pre-redesign map, scrubber and camera until phase 3 rebuilds them in the world.
export function MapScreen() {
  usePlayback()
  const tab = useStore((s) => s.tab)
  useEffect(() => { useStore.getState().setInsight('replay'); if (tab === 'play') useStore.getState().setPlaying(true) }, [tab])
  return (
    <div className="screen">
      <MapView />
      <Scrubber />
    </div>
  )
}
