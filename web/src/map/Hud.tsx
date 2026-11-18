import { useEffect, useMemo, useRef } from 'react'
import { useData } from '../data/DataContext'
import { useStore, useThrottledPlayhead } from '../store/useStore'
import { whereaboutsAt } from '../analytics/position'
import { placeName } from '../analytics/home'
import { fmtTime } from '../analytics/format'
import { label } from '../world/fmt'
import { LENSES, LENS_LABEL, LENS_COLOR, lensOf } from '../analytics/lens'
import { atPlayhead, cumulative, GRAINS, GRAIN_LABEL, resolveGrain, type Grain } from '../analytics/timeline'
import { bedStrip } from '../analytics/beds'
import { useScrub, usePinch } from './useScrub'
import { Rail } from './Rail'
import { monthOf } from './frame'

const WEEKDAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTH = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
// One grain step per notch of ctrl+wheel; trackpad pinches arrive as ctrl+wheel too.
const WHEEL_STEP = 50
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

export function Hud() {
  const data = useData()
  const [m0, m1] = data.meta.range
  const playhead = useThrottledPlayhead(100) ?? m0
  // The raw playhead only while a finger is down; playing at 60 fps must not re-render the HUD.
  const rawPlayhead = useStore((s) => (s.scrubbing ? s.playhead : null))
  const playing = useStore((s) => s.playing)
  const speed = useStore((s) => s.speed)
  const follow = useStore((s) => s.follow)
  const lens = useStore((s) => s.lens)
  const scrubbing = useStore((s) => s.scrubbing)
  const picked = useStore((s) => s.grain)
  const { setPlayhead, setPlaying, setSpeed, setFollow, setLens, setGrain } = useStore.getState()
  const { grain, allowed } = resolveGrain(data, picked)

  const w = whereaboutsAt(data, playhead)
  const visit = w?.mode === 'STILL' ? data.visits.find((v) => v.lvl === 0 && v.start <= playhead && playhead <= v.end) : null
  const tz = visit?.tz ?? data.activities.find((a) => a.start <= playhead && playhead <= a.end)?.tz ?? 0
  const d = new Date((playhead + tz * 60) * 1000)
  const um = new Date(monthOf(playhead)[0] * 1000)
  const where = visit ? placeName(data.places[visit.place_id], visit.place_id) : w ? label(w.mode) : '—'
  const sub = visit ? (data.places[visit.place_id]?.city ?? 'city not on record') : w ? 'in motion' : 'no record'
  const years = useMemo(() => {
    const out: { y: number; pct: number }[] = []
    for (let y = new Date(m0 * 1000).getUTCFullYear() + 1; y <= new Date(m1 * 1000).getUTCFullYear(); y++) out.push({ y, pct: (100 * (Date.UTC(y, 0, 1) / 1000 - m0)) / (m1 - m0) })
    return out
  }, [m0, m1])

  // Year: trips begun and countries first seen by the playhead. Month: cities and nights in the calendar month under it.
  const countryFirst = useMemo(() => {
    const first = new Map<string, number>()
    for (const v of data.visits) { if (v.lvl !== 0) continue; const cc = data.places[v.place_id]?.country_code; if (cc && !first.has(cc)) first.set(cc, v.start) }
    return [...first.values()].sort((a, b) => a - b)
  }, [data])
  const nights = useMemo(() => bedStrip(data).filter((n) => n.kind === 'new' || n.kind === 'repeat'), [data])
  const summary = useMemo(() => {
    if (grain === 'year') {
      let countries = 0
      while (countries < countryFirst.length && countryFirst[countries] <= playhead) countries++
      return { lab: 'So far', val: plural(data.trips.filter((t) => t.start <= playhead).length, 'trip'), sub: plural(countries, 'country').replace('countrys', 'countries') }
    }
    if (grain === 'month') {
      const [a, b] = monthOf(playhead)
      const cities = new Set<string>()
      for (const v of data.visits) { if (v.lvl !== 0 || v.end < a || v.start >= b) continue; const c = data.places[v.place_id]?.city; if (c) cities.add(c) }
      const ym = new Date(a * 1000).toISOString().slice(0, 7)
      return { lab: 'This month', val: plural(cities.size, 'city').replace('citys', 'cities'), sub: plural(nights.filter((n) => n.date.startsWith(ym)).length, 'night') }
    }
    return null
  }, [grain, playhead, data, countryFirst, nights])

  const cum = useMemo(() => cumulative(data), [data])
  const rail = atPlayhead(cum, rawPlayhead ?? playhead)
  const noHome = !data.profile.homes?.length && !Object.values(data.places).some((p) => p.role === 'home')

  const stripRef = useRef<HTMLDivElement>(null)
  useScrub(stripRef, data.meta.range)
  const step = (dir: 1 | -1) => {
    const i = allowed.indexOf(grain), next = allowed[Math.min(allowed.length - 1, Math.max(0, i + dir))]
    if (next !== grain) setGrain(next)
  }
  // Spreading the fingers (or wheeling up) goes finer: year → month → day.
  usePinch(stripRef, (dir) => step(dir))
  const stepRef = useRef(step); stepRef.current = step
  // Native and non-passive, so ctrl+wheel changes the grain instead of zooming the page.
  useEffect(() => {
    const el = stripRef.current; if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      if (Math.abs(e.deltaY) >= WHEEL_STEP) stepRef.current(e.deltaY < 0 ? 1 : -1)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div className={scrubbing ? 'hud scrubbing' : 'hud'}>
      <div className="hud-lens" role="radiogroup" aria-label="Kind of movement">
        {LENSES.map((l) => <button key={l} role="radio" aria-checked={l === lens} className={l === lens ? 'on' : ''} onClick={() => setLens(l)}>{l !== 'all' && <i className="ink" style={{ background: LENS_COLOR[l] }} />}{LENS_LABEL[l]}</button>)}
      </div>
      <div className="hud-stub">
        {grain === 'day' ? (
          <div className="hud-date">
            <span className="dow">{WEEKDAY[d.getUTCDay()]}</span>
            <span className="day">{String(d.getUTCDate()).padStart(2, '0')}</span>
            <span className="mon">{MONTH[d.getUTCMonth()]} {d.getUTCFullYear()}</span>
            <span className="time">{fmtTime(playhead, tz)}</span>
          </div>
        ) : (
          <div className="hud-date coarse">
            <span className="dow">{GRAIN_LABEL[grain]}</span>
            <span className="big">{grain === 'year' ? d.getUTCFullYear() : `${MONTH_LONG[um.getUTCMonth()]} ${um.getUTCFullYear()}`}</span>
          </div>
        )}
        <Rail rail={rail} visible={scrubbing} noHome={noHome} />
        <div className="hud-where">
          {summary ? <>
            <div className="lab">{summary.lab}</div>
            <div className="val">{summary.val}</div>
            <div className="sub">{summary.sub}</div>
          </> : <>
            <div className="lab">{visit ? 'At' : <><i className="ink" style={{ background: w ? LENS_COLOR[lensOf(w.mode)] : 'transparent' }} />Now</>}</div>
            <div className="val">{where}</div>
            <div className="sub">{sub}</div>
          </>}
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
        <div className="hud-strip" ref={stripRef} data-testid="scrub">
          {years.map((y) => <span key={y.y} className="year" style={{ left: `${y.pct}%` }}>{y.y}</span>)}
          <div className="fill" style={{ width: `${(100 * (playhead - m0)) / (m1 - m0)}%` }} />
          <input type="range" min={m0} max={m1} step={600} value={playhead} aria-label="Timeline position"
            onChange={(e) => { setPlayhead(+e.target.value); setFollow(true) }} />
        </div>
        <div className="hud-grain" role="radiogroup" aria-label="Time grain">
          {GRAINS.map((g: Grain) => <button key={g} role="radio" aria-checked={g === grain} disabled={!allowed.includes(g)} className={g === grain ? 'on' : ''} onClick={() => setGrain(g)}>{GRAIN_LABEL[g]}</button>)}
        </div>
      </div>
    </div>
  )
}
