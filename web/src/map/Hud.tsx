import { useMemo } from 'react'
import { useData } from '../data/DataContext'
import { SPEEDS, SPEED_LABEL, useStore } from '../store/useStore'
import { whereaboutsAt } from '../analytics/position'
import { placeName } from '../analytics/home'
import { fmtTime } from '../analytics/format'
import { label } from '../world/fmt'

const WEEKDAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTH = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export function Hud() {
  const data = useData()
  const [m0, m1] = data.meta.range
  const playhead = useStore((s) => s.playhead) ?? m0
  const playing = useStore((s) => s.playing)
  const speed = useStore((s) => s.speed)
  const follow = useStore((s) => s.follow)
  const { setPlayhead, setPlaying, setSpeed, setFollow, toggleBasemap } = useStore.getState()

  const w = whereaboutsAt(data, playhead)
  const visit = w?.mode === 'STILL' ? data.visits.find((v) => v.lvl === 0 && v.start <= playhead && playhead <= v.end) : null
  const tz = visit?.tz ?? data.activities.find((a) => a.start <= playhead && playhead <= a.end)?.tz ?? 0
  const d = new Date((playhead + tz * 60) * 1000)
  const where = visit ? placeName(data.places[visit.place_id], visit.place_id) : w ? label(w.mode) : '—'
  const sub = visit ? (data.places[visit.place_id]?.city ?? 'city not on record') : w ? 'in motion' : 'no record'
  const years = useMemo(() => {
    const out: { y: number; pct: number }[] = []
    for (let y = new Date(m0 * 1000).getUTCFullYear() + 1; y <= new Date(m1 * 1000).getUTCFullYear(); y++) out.push({ y, pct: (100 * (Date.UTC(y, 0, 1) / 1000 - m0)) / (m1 - m0) })
    return out
  }, [m0, m1])

  return (
    <div className="hud">
      <div className="hud-stub">
        <div className="hud-date">
          <span className="dow">{WEEKDAY[d.getUTCDay()]}</span>
          <span className="day">{String(d.getUTCDate()).padStart(2, '0')}</span>
          <span className="mon">{MONTH[d.getUTCMonth()]} {d.getUTCFullYear()}</span>
          <span className="time">{fmtTime(playhead, tz)}</span>
        </div>
        <div className="hud-where">
          <div className="lab">{visit ? 'At' : 'Now'}</div>
          <div className="val">{where}</div>
          <div className="sub">{sub}</div>
        </div>
        <div className="hud-controls">
          <button className="play" onClick={() => { if (!playing && playhead >= m1) setPlayhead(m0); setPlaying(!playing) }} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <svg viewBox="0 0 16 16" width="16" height="16"><rect x="2" y="2" width="4" height="12" fill="currentColor" /><rect x="10" y="2" width="4" height="12" fill="currentColor" /></svg>
              : <svg viewBox="0 0 16 16" width="16" height="16"><path d="M3 2l11 6-11 6z" fill="currentColor" /></svg>}
          </button>
          {SPEEDS.map((s) => <button key={s} className={s === speed ? 'on' : ''} onClick={() => setSpeed(s)}>{SPEED_LABEL[s]}</button>)}
          {!follow && <button className="on" onClick={() => setFollow(true)}>Follow</button>}
          <button onClick={toggleBasemap} aria-label="Toggle basemap">◐</button>
        </div>
      </div>
      <div className="hud-scrub">
        {years.map((y) => <span key={y.y} className="year" style={{ left: `${y.pct}%` }}>{y.y}</span>)}
        <div className="fill" style={{ width: `${(100 * (playhead - m0)) / (m1 - m0)}%` }} />
        <input type="range" min={m0} max={m1} step={600} value={playhead} aria-label="Timeline position"
          onChange={(e) => { setPlayhead(+e.target.value); setFollow(true) }} />
      </div>
    </div>
  )
}
