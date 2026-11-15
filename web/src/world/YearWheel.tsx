import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react'
import { useStore } from '../store/useStore'
import { dragYear, stepYear, wheelState, yearSpan, yearsOf, type Span } from '../app/yearWheel'
import './yearwheel.css'

export const PX_PER_YEAR = 120
const FLAP_MS = 240
const SLOP = 4

/** A figure as split-flap digits: a slot re-keys when its digit changes, so the CSS flap plays once per step. */
function Flap({ text }: { text: string }) {
  return <span className="flap-row">{Array.from(text).map((c, i) => <span key={`${i}-${c}`} className="flap">{c}</span>)}</span>
}

/**
 * The year as the control: drag it, scroll it, or arrow across it and the poster re-prints under your finger.
 * Scrubbing calls `setRange` on every year crossed; release snaps to the nearest whole year.
 */
export function YearWheel({ range }: { range: Span }) {
  const selected = useStore((s) => s.range)
  const setRange = useStore((s) => s.setRange)
  const years = useMemo(() => yearsOf(range), [range])
  const first = years[0], last = years[years.length - 1]
  const { year } = wheelState(range, selected)
  const [drag, setDrag] = useState<{ x0: number; y0: number | null; dx: number } | null>(null)
  const moved = useRef(false)
  const lastWheel = useRef(0)
  const live = useRef(year)
  live.current = year

  const commit = (s: Span) => setRange(s[0] <= range[0] && s[1] >= range[1] ? null : s)
  const go = (y: number | null) => (y === null ? setRange(null) : commit(yearSpan(range, y)))
  const step = (d: -1 | 1) => commit(stepYear(range, selected, d))

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    moved.current = false
    setDrag({ x0: e.clientX, y0: year, dx: 0 })
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) return
    const dx = e.clientX - drag.x0
    if (Math.abs(dx) > SLOP) moved.current = true
    setDrag({ ...drag, dx })
    // The row rides with the finger, so dragging left pulls later years into view.
    const y = dragYear(range, drag.y0, -dx, PX_PER_YEAR)
    if (y !== live.current) { live.current = y; go(y) }
  }
  // Every crossing already committed its year; release only lets the row ease back onto it.
  const up = () => setDrag(null)

  const wheel = (e: WheelEvent) => {
    const d = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0
    if (!d) return
    const t = performance.now()
    if (t - lastWheel.current < FLAP_MS) return
    lastWheel.current = t
    step(d > 0 ? 1 : -1)
  }
  const key = (e: KeyboardEvent) => {
    const k = e.key
    if (k === 'ArrowRight' || k === 'ArrowUp') step(1)
    else if (k === 'ArrowLeft' || k === 'ArrowDown') step(-1)
    else if (k === 'Home') go(first)
    else if (k === 'End') go(last)
    else if (k === 'Escape') go(null)
    else return
    e.preventDefault()
  }
  // A click that ends a drag is the drag's release, not a tap.
  const tap = (y: number | null) => { if (!moved.current) go(y === year ? null : y) }

  const idx = year === null ? -1 : years.indexOf(year)
  const prev = idx > 0 ? years[idx - 1] : idx < 0 ? last : null
  const next = idx >= 0 && idx < years.length - 1 ? years[idx + 1] : null
  const start = drag?.y0 ?? last
  const shift = drag ? drag.dx + ((live.current ?? start) - start) * PX_PER_YEAR : 0

  return (
    <div className={`yearwheel${drag ? ' dragging' : ''}`} style={{ '--dx': `${shift}px` } as CSSProperties}>
      <div
        className="wheel" role="slider" tabIndex={0} aria-label="Year" aria-orientation="horizontal"
        aria-valuemin={first} aria-valuemax={last} aria-valuenow={year ?? last} aria-valuetext={year === null ? 'All years' : String(year)}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel} onKeyDown={key}
      >
        <span className="side l">{prev !== null && <button type="button" tabIndex={-1} className="y" onClick={() => tap(prev)} aria-label={`Year ${prev}`}>{prev}</button>}</span>
        <button type="button" tabIndex={-1} className="y cur" onClick={() => tap(year)} aria-label={year === null ? 'All years' : `Year ${year}, back to all years`}><Flap text={year === null ? 'ALL' : String(year)} /></button>
        <span className="side">{next !== null && <button type="button" tabIndex={-1} className="y" onClick={() => tap(next)} aria-label={`Year ${next}`}>{next}</button>}</span>
      </div>
      <div className="ticks" role="group" aria-label="Jump to a year">
        {years.map((y) => <button type="button" key={y} aria-pressed={y === year} onClick={() => go(y)}>{y}</button>)}
        <button type="button" aria-pressed={year === null} onClick={() => go(null)}>All</button>
      </div>
    </div>
  )
}
