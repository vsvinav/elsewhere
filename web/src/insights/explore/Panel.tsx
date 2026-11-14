import { useMemo } from 'react'
import { useData } from '../../data/DataContext'
import { useStore } from '../../store/useStore'
import { explorationScore } from '../../analytics/explore'
import { boundsOf } from '../../analytics/geo'
import { isHome, isWork } from '../../analytics/geo'

const rgb = (c: number[]) => `rgb(${c.slice(0, 3).join(',')})`

export function ExplorePanel() {
  const data = useData()
  const range = useStore((s) => s.timeRange)
  const setTimeRange = useStore((s) => s.setTimeRange)
  const flyTo = useStore((s) => s.flyTo)
  const buckets = useMemo(() => explorationScore(data, range), [data, range])
  const max = Math.max(1, ...buckets.map((b) => b.new + b.repeat + b.lapsed))
  const tot = buckets.reduce((a, b) => ({ new: a.new + b.new, repeat: a.repeat + b.repeat, lapsed: a.lapsed + b.lapsed }), { new: 0, repeat: 0, lapsed: 0 })
  const score = tot.new + tot.repeat ? Math.round((100 * tot.new) / (tot.new + tot.repeat)) : 0

  const zoomToMonth = (s: number, e: number) => {
    setTimeRange([s, e])
    const pts = data.visits.filter((v) => v.lvl === 0 && v.start >= s && v.start <= e && !isHome(v.type) && !isWork(v.type))
    flyTo(boundsOf(pts))
  }

  return (
    <div className="card panel">
      <div className="kpis">
        <div><b>{score}%</b><span>exploration</span></div>
        <div><b style={{ color: rgb([94, 234, 212]) }}>{tot.new}</b><span>new</span></div>
        <div><b style={{ color: rgb([148, 163, 184]) }}>{tot.repeat}</b><span>repeat</span></div>
        <div><b style={{ color: rgb([248, 113, 113]) }}>{tot.lapsed}</b><span>lapsed</span></div>
      </div>
      <p className="muted hint">Share of places that were brand new. Click a month to zoom in.</p>
      <div className="bars">
        {buckets.map((b) => (
          <button key={b.key} className="bar" title={`${b.key}: ${b.new} new, ${b.repeat} repeat, ${b.lapsed} lapsed`} onClick={() => zoomToMonth(b.start, b.end)}>
            <div className="stack">
              <i style={{ height: `${(100 * b.lapsed) / max}%`, background: rgb([248, 113, 113]) }} />
              <i style={{ height: `${(100 * b.repeat) / max}%`, background: rgb([148, 163, 184]) }} />
              <i style={{ height: `${(100 * b.new) / max}%`, background: rgb([94, 234, 212]) }} />
            </div>
            <span>{b.key.slice(2).replace('-', '/')}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
