import { useEffect } from 'react'
import { useMap } from '@vis.gl/react-google-maps'
import { tally } from './usage'

/** Drop inside a <Map>: counts one dynamic-map load when the map comes up. */
export function MapLoad() {
  const map = useMap()
  useEffect(() => { if (map) tally('maps') }, [map])
  return null
}

/** A Places photo; counts the fetch when it lands. */
export function Photo({ src, className = 'photo', lazy = true }: { src: string; className?: string; lazy?: boolean }) {
  return <img className={className} src={src} alt="" loading={lazy ? 'lazy' : undefined} onLoad={() => tally('photos')} />
}
