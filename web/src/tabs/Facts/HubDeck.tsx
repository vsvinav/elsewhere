import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type UIEvent } from 'react'
import type { Data } from '../../data/types'
import type { Fact, Kind } from '../../analytics/facts'
import { busiest, compareYears, cycleYear, streaks, todaysFact, yearsWithData } from '../../analytics/hub'
import { fmtSpan, highlightState } from '../../analytics/highlights'
import { stats } from '../../analytics/stats'
import { tilt } from '../../analytics/passport'
import { MI, type Units } from '../../profile/units'
import { useStore } from '../../store/useStore'
import { n0, WEEKDAYS } from '../../world/fmt'
import { dmy, headline } from '../highlights/copy'
import { PassportCompact } from './Passport'
import '../Trips/deck.css'
import './hub.css'

export const KIND_LABEL: Record<Kind, string> = { explored: 'Explored', record: 'Record', scale: 'Scale', habit: 'Habit' }
const CARD_IDS = ['today', 'onthisday', 'streaks', 'passport', 'compare', 'rhythm'] as const
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
/** "Sat" from the poster's MON..SUN. */
const dayName = (d: number) => WEEKDAYS[d][0] + WEEKDAYS[d].slice(1).toLowerCase()
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`

interface CardProps { id: string; kind: string; tone?: 'ink' | 'red'; className?: string; selected: boolean; onFocus(): void; open?: { label: string; aria: string; onClick(): void }; children: ReactNode }

function Card({ id, kind, tone, className = '', selected, onFocus, open, children }: CardProps) {
  const style = { '--tilt': `${tilt(id) / 3}deg` } as CSSProperties
  return (
    <article id={`hub-${id}`} role="option" aria-selected={selected} className={`deck-card hub-card ${tone ?? ''} ${selected ? 'is-selected' : ''} ${className}`} style={style} onFocus={onFocus}>
      <div className="caps hub-kind">{kind}</div>
      {children}
      {open && <button type="button" className="hub-open" onClick={open.onClick} aria-label={open.aria}><span>Open · {open.label}</span><span aria-hidden>→</span></button>}
    </article>
  )
}

export interface HubDeckProps {
  data: Data
  raw: Data
  facts: Fact[]
  today: string
  units: Units
  onOpenKind(kind: Kind): void
  onOpenPassport(): void
}

/** The Play deck: six cards along the top of the Facts tab, each opening its full pass. */
export function HubDeck({ data, raw, facts, today, units, onOpenKind, onOpenPassport }: HubDeckProps) {
  const goTo = useStore((s) => s.goTo)
  const fact = useMemo(() => todaysFact(facts, today), [facts, today])
  const day = useMemo(() => highlightState(raw, today), [raw, today])
  const run = useMemo(() => streaks(data), [data])
  const years = useMemo(() => yearsWithData(data), [data])
  const rhythm = useMemo(() => { const s = stats(data); return { grid: s.rhythm, max: s.rhythmMax, peak: busiest(s.rhythm) } }, [data])
  const [pair, setPair] = useState<[number, number] | null>(null)
  useEffect(() => { setPair(null) }, [years])
  const [a, b] = pair ?? (years.length >= 2 ? [years[years.length - 2], years[years.length - 1]] : years.length ? [years[0], years[0]] : [0, 0])
  const side = useMemo(() => compareYears(data, a, b), [data, a, b])
  const cv = (km: number) => (units === 'mi' ? km * MI : km)

  const [selected, setSelected] = useState(0)
  const row = useRef<HTMLDivElement>(null)
  const n = CARD_IDS.length
  const go = useCallback((i: number) => {
    const k = Math.max(0, Math.min(n - 1, i))
    setSelected(k)
    const el = row.current?.children[k] as HTMLElement | undefined
    el?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' })
  }, [n])
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(selected + 1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(selected - 1) }
  }
  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget, mid = el.scrollLeft + el.clientWidth / 2
    let best = 0, dist = Infinity
    Array.from(el.children).forEach((c, i) => { const h = c as HTMLElement; const d = Math.abs(h.offsetLeft + h.offsetWidth / 2 - mid); if (d < dist) { dist = d; best = i } })
    if (best !== selected) setSelected(best)
  }

  const highlight = day.kind === 'highlight' || day.kind === 'short' ? day.highlight : null
  const openDay = () => {
    if (!highlight) return
    goTo({ kind: 'range', from: highlight.range[0], to: highlight.range[1], label: 'On this day' })
    useStore.setState((s) => ({ playhead: highlight.playhead ?? s.playhead, focus: highlight.placeIds.length ? { ids: highlight.placeIds, n: s.focus?.n ?? 1 } : s.focus }))
  }
  const pick = (i: number) => ({ selected: i === selected, onFocus: () => setSelected(i) })
  const u = units === 'mi' ? 'mi' : 'km'

  return (
    <div className="deck hub-deck">
      <div ref={row} className="deck-row hub-row" role="listbox" aria-label="Play deck" aria-orientation="horizontal" tabIndex={0} onKeyDown={onKey} onScroll={onScroll} aria-activedescendant={`hub-${CARD_IDS[selected]}`}>
        <Card id="today" kind="Today" {...pick(0)} className={fact ? `kind-${fact.kind}` : ''} open={fact ? { label: `${KIND_LABEL[fact.kind]} facts`, aria: `Open ${KIND_LABEL[fact.kind].toLowerCase()} facts`, onClick: () => onOpenKind(fact.kind) } : undefined}>
          <h3 className="display hub-h">{fact?.headline ?? 'Nothing yet'}</h3>
          <p className="hub-lede">{fact?.detail ?? 'Widen the range, or wait for the record to fill in.'}</p>
          <div className="hub-date caps">{dmy(today)}</div>
        </Card>

        <Card id="onthisday" kind="On this day" {...pick(1)} open={highlight ? { label: 'The map', aria: 'Open on the map', onClick: openDay } : undefined}>
          {highlight ? (
            <>
              <h3 className="display hub-h">{highlight.city}</h3>
              <p className="hub-lede">{dmy(highlight.date)} — you {highlight.verb} {highlight.city}.</p>
              <div className="hub-date caps">{headline(highlight)}</div>
            </>
          ) : (
            <>
              <h3 className="display hub-h">Quiet day</h3>
              <p className="hub-lede">{day.kind === 'quiet' && day.nearest ? `Nothing on ${dmy(today).slice(0, -5)} in earlier years. The nearest thing on record: ${dmy(day.nearest.date)}, ${day.nearest.city}.` : 'Nothing on this day in earlier years.'}</p>
            </>
          )}
        </Card>

        <Card id="streaks" kind="Streaks" tone="ink" {...pick(2)} open={{ label: 'Record facts', aria: 'Open record facts', onClick: () => onOpenKind('record') }}>
          <ul className="hub-streaks">
            <li><b className="display">{run.away?.n ?? 0}</b><span className="caps">Longest away streak</span><small>{run.away ? fmtSpan(run.away.from, run.away.to) : 'No nights away yet'}</small></li>
            <li><b className="display">{run.newWeeks?.n ?? 0}</b><span className="caps">Weeks with a new place</span><small>{run.newWeeks ? fmtSpan(run.newWeeks.from, run.newWeeks.to) : 'Nothing new yet'}</small></li>
            <li className={run.current === 0 ? 'zero' : ''}><b className="display">{run.current}</b><span className="caps">Current away streak</span><small>{run.current ? 'nights and counting' : 'Home tonight'}</small></li>
          </ul>
        </Card>

        <Card id="passport" kind="Passport" {...pick(3)} open={{ label: 'Passport', aria: 'Open passport', onClick: onOpenPassport }}>
          <PassportCompact />
        </Card>

        <Card id="compare" kind="Compare" {...pick(4)} open={{ label: 'Scale facts', aria: 'Open scale facts', onClick: () => onOpenKind('scale') }}>
          <div className="hub-years">
            {([a, b] as const).map((y, i) => (
              <button key={i} type="button" className="hub-chip" aria-label={`Compare year ${y}`} disabled={years.length < 3} onClick={() => setPair(i === 0 ? [cycleYear(years, a, b), b] : [a, cycleYear(years, b, a)])}>{y}</button>
            ))}
          </div>
          <table className="hub-table">
            <tbody>
              {([['Places', (f: typeof side[0]) => n0(f.places)], ['Nights away', (f) => n0(f.nightsAway)], [u, (f) => n0(cv(f.km))], ['Countries', (f) => n0(f.countries)]] as [string, (f: typeof side[0]) => string][]).map(([label, of]) => (
                <tr key={label} aria-label={label}><th scope="row" className="caps">{label}</th><td className="display">{of(side[0])}</td><td className="display">{of(side[1])}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card id="rhythm" kind="Rhythm" tone="red" {...pick(5)} open={{ label: 'Habit facts', aria: 'Open habit facts', onClick: () => onOpenKind('habit') }}>
          <h3 className="display hub-h">{rhythm.peak ? `${dayName(rhythm.peak.d)} ${hh(rhythm.peak.h)}` : 'Home all week'}</h3>
          <p className="hub-lede">{rhythm.peak ? `Busiest: ${dayName(rhythm.peak.d)} ${hh(rhythm.peak.h)}. Hours away from home, by weekday and hour.` : 'No hours away from home on record.'}</p>
          <div className="heat-mini" role="img" aria-label="Heat grid of hours away from home by weekday and hour">
            {rhythm.grid.map((r, d) => r.map((v, h) => <i key={`${d}-${h}`} style={{ ['--v' as string]: rhythm.max ? Math.max(0.12, v / rhythm.max) : 0.12 }} />))}
          </div>
        </Card>
      </div>
      <div className="deck-nav hub-nav">
        <button type="button" onClick={() => go(selected - 1)} disabled={selected === 0} aria-label="Previous card">←</button>
        <div className="dots" role="group" aria-label="Cards">
          {CARD_IDS.map((id, i) => <button key={id} type="button" className={i === selected ? 'on' : ''} aria-label={`Card ${i + 1} of ${n}`} aria-pressed={i === selected} onClick={() => go(i)}><i className={i === selected ? 'on' : ''} /></button>)}
        </div>
        <button type="button" onClick={() => go(selected + 1)} disabled={selected >= n - 1} aria-label="Next card">→</button>
        <span className="caps">{selected + 1} of {n}</span>
      </div>
    </div>
  )
}
