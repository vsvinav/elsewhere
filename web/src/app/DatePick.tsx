import { useEffect, useRef, useState } from 'react'
import './datepick.css'

const DAY = 86400
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

const utc = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m, d) / 1000)
const ymd = (ts: number) => { const x = new Date(ts * 1000); return [x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()] as const }
const short = (ts: number) => { const [y, m, d] = ymd(ts); return `${d} ${MONTHS[m].slice(0, 3)} ${y}` }

interface Props {
  label: string
  /** Midnight UTC of the chosen day. */
  value: number
  min: number
  max: number
  /** The other end of the range, for shading the span. */
  other: number
  onChange(day: number): void
}

/** A poster-styled date: a chip that opens a one-month calendar; days outside [min, max] are dead. */
export function DatePick({ label, value, min, max, other, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [[vy, vm], setView] = useState<readonly [number, number]>(() => { const [y, m] = ymd(value); return [y, m] })
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => { if (open) { const [y, m] = ymd(value); setView([y, m]) } }, [open, value])
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    addEventListener('pointerdown', away); addEventListener('keydown', esc)
    return () => { removeEventListener('pointerdown', away); removeEventListener('keydown', esc) }
  }, [open])

  const first = utc(vy, vm, 1), days = new Date(Date.UTC(vy, vm + 1, 0)).getUTCDate()
  const lead = (new Date(first * 1000).getUTCDay() + 6) % 7
  const lo = Math.min(value, other), hi = Math.max(value, other)
  const [miny, minm] = ymd(min), [maxy, maxm] = ymd(max)
  const canPrev = vy * 12 + vm > miny * 12 + minm, canNext = vy * 12 + vm < maxy * 12 + maxm
  const step = (n: number) => setView(([y, m]) => { const t = y * 12 + m + n; return [Math.floor(t / 12), ((t % 12) + 12) % 12] })

  return (
    <div className={`datepick${open ? ' open' : ''}`} ref={root}>
      <button type="button" className="datepick-chip" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{label}</span><b>{short(value)}</b><i aria-hidden>▾</i>
      </button>
      {open && (
        <div className="datepick-pop" role="dialog" aria-label={`${label} date`}>
          <div className="datepick-head">
            <button type="button" onClick={() => step(-1)} disabled={!canPrev} aria-label="Previous month">←</button>
            <h3>{MONTHS[vm]} <small>{vy}</small></h3>
            <button type="button" onClick={() => step(1)} disabled={!canNext} aria-label="Next month">→</button>
          </div>
          <div className="datepick-grid" role="grid">
            {DOW.map((d, i) => <span key={i} className="dow">{d}</span>)}
            {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} />)}
            {Array.from({ length: days }, (_, i) => {
              const ts = utc(vy, vm, i + 1), dead = ts < min || ts > max
              const cls = ts === value ? 'pick' : ts > lo && ts < hi ? 'span' : ts === other ? 'end' : ''
              return <button type="button" key={i} className={cls} disabled={dead} onClick={() => { onChange(ts); setOpen(false) }} aria-pressed={ts === value}>{i + 1}</button>
            })}
          </div>
          <div className="datepick-foot">
            <button type="button" onClick={() => { onChange(min); setOpen(false) }}>First day</button>
            <button type="button" onClick={() => { onChange(max); setOpen(false) }}>Last day</button>
          </div>
        </div>
      )}
    </div>
  )
}

interface MonthProps {
  label: string
  /** First second of the chosen month (UTC), or 0 / null for the open end. */
  value: number | null
  min: number
  max: number
  /** What the open end means: "Start of record" or "Still". */
  openLabel: string
  onChange(month: number | null): void
}

/** The same chip and popover, but a year of months; the open end is a labelled choice too. */
export function MonthPick({ label, value, min, max, openLabel, onChange }: MonthProps) {
  const [open, setOpen] = useState(false)
  const [vy, setYear] = useState(() => ymd(value || min)[0])
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => { if (open) setYear(ymd(value || min)[0]) }, [open, value, min])
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    addEventListener('pointerdown', away); addEventListener('keydown', esc)
    return () => { removeEventListener('pointerdown', away); removeEventListener('keydown', esc) }
  }, [open])
  const [miny, minm] = ymd(min), [maxy, maxm] = ymd(max)
  const [py, pm] = value ? ymd(value) : [0, 0]
  const pick = (m: number | null) => { onChange(m); setOpen(false) }
  return (
    <div className={`datepick month${open ? ' open' : ''}`} ref={root}>
      <button type="button" className="datepick-chip" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{label}</span><b>{value ? `${MONTHS[pm].slice(0, 3)} ${py}` : openLabel}</b><i aria-hidden>▾</i>
      </button>
      {open && (
        <div className="datepick-pop" role="dialog" aria-label={`${label} month`}>
          <div className="datepick-head">
            <button type="button" onClick={() => setYear(vy - 1)} disabled={vy <= miny} aria-label="Previous year">←</button>
            <h3>{vy}</h3>
            <button type="button" onClick={() => setYear(vy + 1)} disabled={vy >= maxy} aria-label="Next year">→</button>
          </div>
          <div className="datepick-grid months" role="grid">
            {MONTHS.map((name, m) => {
              const ts = utc(vy, m, 1), dead = vy * 12 + m < miny * 12 + minm || vy * 12 + m > maxy * 12 + maxm
              const on = !!value && py === vy && pm === m
              return <button type="button" key={m} className={on ? 'pick' : ''} disabled={dead} onClick={() => pick(ts)} aria-pressed={on}>{name.slice(0, 3)}</button>
            })}
          </div>
          <div className="datepick-foot">
            <button type="button" onClick={() => pick(null)}>{openLabel}</button>
          </div>
        </div>
      )}
    </div>
  )
}

export { DAY }
