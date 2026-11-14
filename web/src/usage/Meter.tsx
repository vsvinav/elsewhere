import { useEffect } from 'react'
import { useMap } from '@vis.gl/react-google-maps'
import { dollars, LABEL, RATE, resetUsage, tally, useUsage } from './usage'

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

/** What this browser has asked Google for, and roughly what that costs the key's owner. */
export function UsageRow() {
  const u = useUsage()
  const n = u.details + u.photos + u.maps
  const since = new Date(u.since).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return (
    <div className="usage" title={(['details', 'photos', 'maps'] as const).map((k) => `${LABEL[k]}: ${u[k]} × $${RATE[k]}/1k`).join('\n')}>
      <span className="lab">Google API · since {since}</span>
      <span>{n.toLocaleString('en-US')} calls · ~${dollars(u).toFixed(2)}</span>
      <span className="fine">{(['details', 'photos', 'maps'] as const).filter((k) => u[k]).map((k) => `${u[k]} ${LABEL[k].toLowerCase()}`).join(' · ') || 'nothing yet'}. List prices, before the free tier.</span>
      {n > 0 && <button onClick={resetUsage}>Reset</button>}
    </div>
  )
}
