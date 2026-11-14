import { useMemo } from 'react'
import { useData } from '../data/DataContext'
import { useStore, useThrottledPlayhead } from '../store/useStore'
import { whereaboutsAt } from '../analytics/position'
import { placeName } from '../analytics/home'
import { fmtTime } from '../analytics/format'
import { label } from '../world/fmt'
import { LENSES, LENS_LABEL, LENS_COLOR, lensOf } from '../analytics/lens'
import { CATS, CAT_COLOR, CAT_LABEL, categoryOf } from '../analytics/category'
import { isHome } from '../analytics/geo'

const WEEKDAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTH = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export function Hud() {
  const data = useData()
  const [m0, m1] = data.meta.range
  const playhead = useThrottledPlayhead(100) ?? m0
  const playing = useStore((s) => s.playing)
  const speed = useStore((s) => s.speed)
  const follow = useStore((s) => s.follow)
  const lens = useStore((s) => s.lens)
  const tab = useStore((s) => s.tab)
  const hidden = useStore((s) => s.hiddenCats)
  const counts = useMemo(() => { const n = Object.fromEntries(CATS.map((c) => [c, 0])) as Record<string, number>; for (const p of Object.values(data.places)) if (!isHome(p)) n[categoryOf(p)]++; return n }, [data.places])
  const { setPlayhead, setPlaying, setSpeed, setFollow, setLens, toggleCat, setHiddenCats } = useStore.getState()

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
      {tab === 'map' && (
        <div className="hud-cats" aria-label="Kinds of stop">
          {CATS.filter((c) => counts[c]).map((c) => {
            const on = !hidden.includes(c)
            return (
              <button key={c} aria-pressed={on} className={on ? 'on' : ''} onClick={() => toggleCat(c)}
                onDoubleClick={() => setHiddenCats(CATS.filter((x) => x !== c))} title="Click to toggle · double-click for only this">
                <i className="ink" style={{ background: CAT_COLOR[c] }} />{CAT_LABEL[c]}<small>{counts[c].toLocaleString('en-US')}</small>
              </button>
            )
          })}
          {hidden.length > 0 && <button className="all" onClick={() => setHiddenCats([])}>Show all</button>}
        </div>
      )}
      <div className="hud-lens" role="radiogroup" aria-label="Kind of movement">
        {LENSES.map((l) => <button key={l} role="radio" aria-checked={l === lens} className={l === lens ? 'on' : ''} onClick={() => setLens(l)}>{l !== 'all' && <i className="ink" style={{ background: LENS_COLOR[l] }} />}{LENS_LABEL[l]}</button>)}
      </div>
      <div className="hud-stub">
        <div className="hud-date">
          <span className="dow">{WEEKDAY[d.getUTCDay()]}</span>
          <span className="day">{String(d.getUTCDate()).padStart(2, '0')}</span>
          <span className="mon">{MONTH[d.getUTCMonth()]} {d.getUTCFullYear()}</span>
          <span className="time">{fmtTime(playhead, tz)}</span>
        </div>
        <div className="hud-where">
          <div className="lab">{visit ? 'At' : <><i className="ink" style={{ background: w ? LENS_COLOR[lensOf(w.mode)] : 'transparent' }} />Now</>}</div>
          <div className="val">{where}</div>
          <div className="sub">{sub}</div>
        </div>
        <div className="hud-controls">
          <button className="play" onClick={() => { if (!playing && playhead >= m1) setPlayhead(m0); setPlaying(!playing) }} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <svg viewBox="0 0 16 16" width="16" height="16"><rect x="2" y="2" width="4" height="12" fill="currentColor" /><rect x="10" y="2" width="4" height="12" fill="currentColor" /></svg>
              : <svg viewBox="0 0 16 16" width="16" height="16"><path d="M3 2l11 6-11 6z" fill="currentColor" /></svg>}
          </button>
          <label className="hud-speed">
            <span>{speed < 10 ? speed.toFixed(1) : Math.round(speed)}×</span>
            <input type="range" min={-1} max={5} step={0.1} value={Math.log2(speed)} aria-label="Replay speed" onChange={(e) => setSpeed(2 ** +e.target.value)} />
          </label>
          {!follow && <button className="on" onClick={() => setFollow(true)}>Follow</button>}
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
