import { useMemo } from 'react'
import { useData } from '../../data/DataContext'
import { useStore } from '../../store/useStore'
import { distinctPlaces, kmByMode } from '../../analytics/range'
import { fmtDate, fmtKm, fmtTime, MODE_LABEL } from '../../analytics/format'
import { modeColor } from './colors'

export function ReplayPanel() {
  const data = useData()
  const [r0, r1] = useStore((s) => s.timeRange)
  const playhead = useStore((s) => s.playhead)
  const now = playhead ?? r1

  const stats = useMemo(() => {
    const acts = data.activities.filter((a) => a.start >= r0 && a.end <= now)
    const visits = data.visits.filter((v) => v.start >= r0 && v.start <= now)
    const current = [...visits].reverse().find((v) => v.lvl === 0 && v.start <= now && v.end >= now)
    const last = visits[visits.length - 1]
    const tz = (current ?? last)?.tz ?? 0
    const km = kmByMode(acts)
    const modes = Object.entries(km).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const here = current ? data.places[current.place_id] : null
    return { km, modes, total: Object.values(km).reduce((a, b) => a + b, 0), places: distinctPlaces(visits), tz, here, current }
  }, [data, r0, now])

  return (
    <div className="card panel">
      <div className="date">{fmtDate(now, stats.tz)}</div>
      <div className="time">{fmtTime(now, stats.tz)}</div>
      <div className="where">
        {stats.here ? `${stats.here.city ?? 'Somewhere'}${stats.here.country_code ? ', ' + stats.here.country_code : ''}` : 'In transit'}
        {stats.current && <span className="muted"> · {stats.current.type === 'INFERRED_HOME' ? 'home' : stats.current.type === 'INFERRED_WORK' || stats.current.type === 'WORK' ? 'work' : stats.here?.name ?? ''}</span>}
      </div>
      <div className="kpis">
        <div><b>{fmtKm(stats.total)}</b><span>travelled</span></div>
        <div><b>{stats.places}</b><span>places</span></div>
      </div>
      <div className="modes">
        {stats.modes.map(([m, km]) => (
          <div key={m} className="mode">
            <i style={{ background: `rgb(${modeColor(m).slice(0, 3).join(',')})` }} />
            <span>{MODE_LABEL[m] ?? m}</span>
            <em>{fmtKm(km)}</em>
          </div>
        ))}
      </div>
    </div>
  )
}
