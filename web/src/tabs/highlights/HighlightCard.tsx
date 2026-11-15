import { useMemo, useState, type ReactNode } from 'react'
import type { Data } from '../../data/types'
import { highlightState, localToday, type Highlight } from '../../analytics/highlights'
import { Field, Pass, Stamp } from '../../world'
import { Beds } from '../../world/figures/Figures'
import { TripMap } from '../../world/TripMap'
import { DatePick, DAY } from '../../app/DatePick'
import { AskMoreDrawer } from './AskMoreDrawer'
import { ago, dayMonth, dmy, headline, type OpenDoor } from './copy'
import './highlights.css'

interface Props {
  data: Data
  /** YYYY-MM-DD; defaults to the browser's today. */
  today?: string
  onOpen: OpenDoor
  /** Offered when a day's place has no city name; takes the visitor to the Maps key step. */
  onKeyStep?(): void
}

const iso = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10)

/** One day's card: headline, three facts, a scoped map, and the "Ask for more" sheet. */
function Card({ data, h, lede, onOpen, onKeyStep, children }: { data: Data; h: Highlight; lede?: string; onOpen: OpenDoor; onKeyStep?(): void; children?: ReactNode }) {
  const [asking, setAsking] = useState(false)
  const open = () => onOpen(h.range, h.playhead, h.placeIds)
  return (
    <Pass className="hl-card" share text={() => `${headline(h).toUpperCase()}\n${h.facts.map((f) => f.label).join(' · ')}`} stub={
      <>
        <Field label={h.scope === 'week' ? 'This week' : 'On this day'}>{dmy(h.date)}</Field>
        <Field label="Years ago">{h.yearsAgo > 0 ? h.yearsAgo : '—'}</Field>
        {children}
        <Stamp top="Highlight" big={String(new Date(h.range[0] * 1000).getUTCFullYear())} bottom={ago(h.yearsAgo)} />
      </>
    }>
      {lede && <p className="hl-note">{lede}</p>}
      <h2 className="hl-h">{headline(h)}</h2>
      {!h.cityKnown && <p className="hl-note">That place has no name yet. {onKeyStep && <button type="button" className="hl-link" onClick={onKeyStep}>Add a Google Maps key</button>}{onKeyStep ? ' to name it.' : 'Add a Google Maps key to name it.'}</p>}
      {h.facts.length > 0 && (
        <ul className="hl-facts" aria-label="Facts">
          {h.facts.map((f) => (
            <li key={f.id}>
              <button type="button" className="hl-fact caps" onClick={() => onOpen(f.range, f.playhead, f.placeIds)} aria-label={`${f.label} — open on the map`}>
                {f.label}
                {f.strip && <span className="hl-week"><Beds nights={f.strip} /></span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="hl-map" role="button" tabIndex={0} aria-label="Open this day on the map" onClick={open} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }}>
        <TripMap data={data} range={h.range} height={260} />
      </div>
      <button type="button" className="btn hl-ask" onClick={() => setAsking(true)} aria-haspopup="dialog" aria-expanded={asking}>Ask for more</button>
      <AskMoreDrawer data={data} highlight={h} open={asking} onClose={() => setAsking(false)} onOpen={onOpen} />
    </Pass>
  )
}

/** "On this day": what the record has to say about today's date, with its empty states. */
export function HighlightCard({ data, today, onOpen, onKeyStep }: Props) {
  const [date, setDate] = useState(() => today ?? localToday())
  const state = useMemo(() => highlightState(data, date), [data, date])
  const [showNearest, setShowNearest] = useState(false)
  const picker = (
    <div className="hl-pick">
      <DatePick label="Another day" value={Date.parse(date + 'T00:00:00Z') / 1000} min={Math.floor(data.meta.range[0] / DAY) * DAY} max={Date.parse((today ?? localToday()) + 'T00:00:00Z') / 1000} other={Date.parse(date + 'T00:00:00Z') / 1000} onChange={(d) => { setDate(iso(d)); setShowNearest(false) }} />
    </div>
  )

  if (state.kind === 'none') return null
  if (state.kind === 'short') {
    return <Card data={data} h={state.highlight} onOpen={onOpen} onKeyStep={onKeyStep} lede={`Your record starts ${dayMonth(state.starts)}. Highlights begin on ${dayMonth(state.starts)} next year — meanwhile, here's your farthest day so far.`}>{picker}</Card>
  }
  if (state.kind === 'quiet') {
    const near = state.nearest
    if (showNearest && near) return <Card data={data} h={near} onOpen={onOpen} onKeyStep={onKeyStep} lede={`Nothing from a ${dayMonth(date)} yet — the nearest day with a story:`}>{picker}</Card>
    return (
      <Pass className="hl-card quiet" share={false} stub={<><Field label="On this day">{dmy(date)}</Field>{picker}</>}>
        <h2 className="hl-h">Nothing from a {dayMonth(date)} yet.</h2>
        {near ? (
          <p className="hl-note">Nearest: <button type="button" className="hl-link" onClick={() => setShowNearest(true)}>{dmy(near.date)}, {near.city}</button>.</p>
        ) : <p className="hl-note">Pick another day to see what the record has to say.</p>}
      </Pass>
    )
  }
  return <Card data={data} h={state.highlight} onOpen={onOpen} onKeyStep={onKeyStep}>{picker}</Card>
}
