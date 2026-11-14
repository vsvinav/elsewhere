import { useEffect, useMemo, useState } from 'react'
import { useData } from '../../data/DataContext'
import { useStore } from '../../store/useStore'
import { statsFor } from './layers'
import type { Direction, LegStats } from '../../analytics/commute'
import { boundsOf } from '../../analytics/geo'
import { MODE_LABEL } from '../../analytics/format'

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function Grid({ s }: { s: LegStats }) {
  // weekday × hour (5–22) departure heat grid
  const hours = Array.from({ length: 18 }, (_, i) => i + 5)
  const max = Math.max(1, ...s.by_hour)
  return (
    <div className="heat">
      {hours.map((h) => <i key={h} style={{ opacity: 0.15 + 0.85 * (s.by_hour[h] / max) }} title={`${h}:00 · ${s.by_hour[h]} departures`} />)}
      <div className="heat-labels"><span>5am</span><span>noon</span><span>10pm</span></div>
      <div className="weekdays">{DAYS.map((d, i) => <span key={i} style={{ opacity: 0.3 + 0.7 * (s.by_weekday[i] / Math.max(1, ...s.by_weekday)) }}>{d}</span>)}</div>
    </div>
  )
}

export function CommutePanel() {
  const data = useData()
  const range = useStore((s) => s.timeRange)
  const flyTo = useStore((s) => s.flyTo)
  const [dir, setDir] = useState<Direction>('to_work')
  const stats = useMemo(() => statsFor(data, range), [data, range])
  const s = stats[dir]

  useEffect(() => {
    flyTo(boundsOf(stats.legs.flatMap((l) => l.path.map(([lng, lat]) => ({ lng, lat })))))
  }, [stats, flyTo])

  if (!stats.legs.length) {
    return <div className="card panel"><p className="muted">No home → work legs in this range. Widen the window on the scrubber.</p></div>
  }
  const modes = Object.entries(s.by_mode).sort((a, b) => b[1] - a[1]).slice(0, 4)
  return (
    <div className="card panel">
      <div className="chips">
        <button className={`chip ${dir === 'to_work' ? 'on' : ''}`} onClick={() => setDir('to_work')}>→ Work</button>
        <button className={`chip ${dir === 'to_home' ? 'on' : ''}`} onClick={() => setDir('to_home')}>→ Home</button>
      </div>
      <div className="kpis">
        <div><b>{s.n}</b><span>legs</span></div>
        <div><b>{Math.round(s.median_min)}m</b><span>median</span></div>
        <div><b>{Math.round(s.p90_min)}m</b><span>bad day (p90)</span></div>
      </div>
      <Grid s={s} />
      <div className="modes">
        {modes.map(([m, n]) => (
          <div key={m} className="mode"><span>{MODE_LABEL[m] ?? m}</span><em>{Math.round((100 * n) / s.n)}% of legs</em></div>
        ))}
      </div>
      <p className="muted hint">Routes on the map: teal = faster than usual, red = slower.</p>
    </div>
  )
}
