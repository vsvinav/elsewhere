import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react'
import { useStore } from '../store/useStore'
import { dragYear, stepYear, wheelState, yearSpan, yearsOf, type Span } from '../app/yearWheel'
import './yearwheel.css'

/** Fallback pitch until the figure has been measured. */
export const PX_PER_YEAR = 120
/** One wheel step per this much trackpad travel. */
const WHEEL_PX = 120
const WHEEL_IDLE_MS = 300
const SLOP = 4

/** A figure as split-flap digits: only a slot whose digit changed since the last print re-keys, so the flap plays once per step and not on mount. */
function Flap({ text }: { text: string }) {
  const prev = useRef(text)
  const was = prev.current
  useEffect(() => { prev.current = text })
  return <span className="flap-row">{Array.from(text).map((c, i) => <span key={`${i}-${c}`} className={was[i] === c ? '' : 'flap'}>{c}</span>)}</span>
}

interface Props {
  range: Span
  /** Distance between one year and the next on the row; measured from the layout when omitted. */
  pitch?: number
}

/**
 * The year as the control: drag it, scroll it, or arrow across it and the poster re-prints under your finger.
 * Scrubbing calls `setRange` on every year crossed; release snaps to the nearest whole year.
 */
export function YearWheel({ range, pitch: pitchProp }: Props) {
  const selected = useStore((s) => s.range)
  const setRange = useStore((s) => s.setRange)
  const years = useMemo(() => yearsOf(range), [range])
  const first = years[0], last = years[years.length - 1]
  const { year, all, from } = wheelState(range, selected)
  const custom = year === null && !all
  const [drag, setDrag] = useState<{ id: number; x0: number; y0: number | null; dx: number } | null>(null)
  const moved = useRef(false)
  const live = useRef(year)
  live.current = year
  const wheelAcc = useRef(0)
  const wheelIdle = useRef(0)
  const row = useRef<HTMLDivElement>(null)
  const big = useRef<HTMLDivElement>(null)
  const [measured, setMeasured] = useState(PX_PER_YEAR)
  const pitch = pitchProp ?? measured

  // The real pitch is the big figure plus the row's gap; it changes with the viewport and the figure's digits.
  useLayoutEffect(() => {
    if (pitchProp !== undefined || !big.current || !row.current || typeof ResizeObserver === 'undefined') return
    const el = big.current, r = row.current
    const read = () => { const p = el.offsetWidth + parseFloat(getComputedStyle(r).columnGap || '0'); if (p > 0) setMeasured(p) }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [pitchProp])

  const commit = (s: Span) => setRange(s[0] <= range[0] && s[1] >= range[1] ? null : s)
  const go = (y: number | null) => (y === null ? setRange(null) : commit(yearSpan(range, y)))
  const step = (d: -1 | 1) => commit(stepYear(range, selected, d))

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    moved.current = false
    setDrag({ id: e.pointerId, x0: e.clientX, y0: year, dx: 0 })
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) return
    const dx = e.clientX - drag.x0
    // Only a real drag takes the pointer; a tap must still reach the buttons underneath.
    if (!moved.current && Math.abs(dx) > SLOP) { moved.current = true; e.currentTarget.setPointerCapture?.(drag.id) }
    if (!moved.current) return
    setDrag({ ...drag, dx })
    // The row rides with the finger, so dragging left pulls later years into view.
    const y = dragYear(range, drag.y0, -dx, pitch)
    if (y !== live.current) { live.current = y; go(y) }
  }
  // Every crossing already committed its year; release only lets the row ease back onto it.
  const up = () => setDrag(null)

  const wheel = (e: WheelEvent) => {
    const d = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0
    if (!d) return
    const t = performance.now()
    if (t - wheelIdle.current > WHEEL_IDLE_MS) wheelAcc.current = 0
    wheelIdle.current = t
    wheelAcc.current += d
    if (Math.abs(wheelAcc.current) < WHEEL_PX) return
    step(wheelAcc.current > 0 ? 1 : -1)
    wheelAcc.current -= Math.sign(wheelAcc.current) * WHEEL_PX
  }
  const key = (e: KeyboardEvent) => {
    const k = e.key
    if (k === 'ArrowRight' || k === 'ArrowUp') step(1)
    else if (k === 'ArrowLeft' || k === 'ArrowDown') step(-1)
    else if (k === 'Home') go(first)
    else if (k === 'End') go(last)
    else if (k === 'Escape') go(null)
    else if (k === 'Enter' || k === ' ') tapBig()
    else return
    e.preventDefault()
  }
  // A click that ends a drag is the drag's release, not a tap.
  const tap = (y: number) => { if (!moved.current) go(y) }
  const tapBig = () => { if (!moved.current && !all) go(null) }

  const shown = year ?? (custom ? yearOf(from) : null)
  const idx = shown === null ? -1 : years.indexOf(shown)
  const prev = idx > 0 ? years[idx - 1] : idx < 0 ? last : null
  const next = idx >= 0 && idx < years.length - 1 ? years[idx + 1] : null
  const start = drag?.y0 ?? last
  const shift = drag ? drag.dx + ((live.current ?? start) - start) * pitch : 0
  const valuetext = year !== null ? String(year) : all ? 'All years' : 'Custom window'

  return (
    <div className={`yearwheel${drag ? ' dragging' : ''}${custom ? ' custom' : ''}`} style={{ '--dx': `${shift}px` } as CSSProperties}>
      <div ref={row} className="wheel" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel}>
        <span className="side l">{prev !== null && <button type="button" tabIndex={-1} className="y" onClick={() => tap(prev)} aria-label={`Year ${prev}`}>{prev}</button>}</span>
        <div
          ref={big} className="y cur" role="slider" tabIndex={0} aria-label="Year" aria-orientation="horizontal"
          aria-valuemin={first} aria-valuemax={last} aria-valuenow={shown ?? last} aria-valuetext={valuetext}
          onClick={tapBig} onKeyDown={key}
        >
          <Flap text={shown === null ? 'ALL' : String(shown)} />
          {custom && <span className="tag">Custom</span>}
        </div>
        <span className="side">{next !== null && <button type="button" tabIndex={-1} className="y" onClick={() => tap(next)} aria-label={`Year ${next}`}>{next}</button>}</span>
      </div>
      <div className="ticks" role="group" aria-label="Jump to a year">
        {years.map((y) => <button type="button" key={y} aria-pressed={y === year} onClick={() => go(y)}>{y}</button>)}
        <button type="button" aria-pressed={all} onClick={() => go(null)}>ALL</button>
      </div>
    </div>
  )
}

const yearOf = (ts: number) => new Date(ts * 1000).getUTCFullYear()
