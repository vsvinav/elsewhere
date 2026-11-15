import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Data } from '../../data/types'
import { followUps, MAX_DEPTH, type Answer, type FollowUp, type FollowUpId, type Highlight } from '../../analytics/highlights'
import { Pass } from '../../world'
import { Beds } from '../../world/figures/Figures'
import { TripMap } from '../../world/TripMap'
import { ago, dmy, headline, type OpenDoor } from './copy'

const CRUMB: Record<FollowUpId, string> = {
  stay: 'the stay', distance: 'the distance', trip: 'the trip', route: 'the route', compare: 'compare years',
  did: 'the day', back: 'been back', farthest: 'farthest', lastYear: 'last year',
}

interface Step { fu: FollowUp; h: Highlight }

const FOCUSABLE = 'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])'

/** One answer printed as a pass: title, detail, the figure for its kind, and a door to the map. */
function AnswerPass({ data, step, onOpen }: { data: Data; step: Step; onOpen: OpenDoor }) {
  const { fu } = step
  const a: Answer = fu.answer
  const door = (d: { range: [number, number]; playhead?: number; placeIds: string[] }) => () => onOpen(d.range, d.playhead, d.placeIds)
  return (
    <Pass share={false} className="hl-answer">
      <div className="caps hl-q-label">{fu.question}</div>
      {a.kind === 'highlight' ? (
        <>
          <h3 className="hl-a">{headline(a.highlight)}</h3>
          <p className="hl-d">{dmy(a.highlight.date)}</p>
          {a.highlight.facts.length > 0 && <ul className="hl-facts small">{a.highlight.facts.map((f) => <li key={f.id}><button type="button" className="hl-fact caps" onClick={door(f)}>{f.label}</button></li>)}</ul>}
        </>
      ) : (
        <>
          <h3 className="hl-a">{a.title}</h3>
          <p className="hl-d">{a.detail}</p>
        </>
      )}
      {a.kind === 'stay' && <div className="hl-strip"><Beds nights={a.strip} /></div>}
      {a.kind === 'trip' && (
        <ol className="hl-setlist">
          {a.cities.map((c) => (
            <li key={c.city}><button type="button" className="hl-row" onClick={door(c)}><b>{c.city}</b><span>{c.nights} night{c.nights === 1 ? '' : 's'}</span>{c.first && <em className="caps">first time</em>}</button></li>
          ))}
        </ol>
      )}
      {a.kind === 'route' && (
        <>
          <TripMap data={data} range={a.range} height={220} />
          <button type="button" className="btn" onClick={() => onOpen(a.range, a.range[0], a.placeIds)}>Play this route</button>
        </>
      )}
      {a.kind === 'compare' && (() => {
        const max = Math.max(1, ...a.years.map((y) => y.km))
        return (
          <div className="hl-years" role="list">
            {a.years.map((y) => (
              <div key={y.year} role="listitem" className={`hl-year ${y.now ? 'now' : ''}`}>
                <i style={{ height: `${Math.max(4, Math.round((y.km / max) * 100))}%` }} aria-hidden />
                <b>{y.year}</b>
                <span>{y.city ?? '—'}</span>
                <small>{Math.round(y.km).toLocaleString('en-US')} km</small>
                {y.now && <em className="caps">now</em>}
              </div>
            ))}
          </div>
        )
      })()}
      {a.kind === 'did' && (
        <ol className="hl-ledger">
          {a.stops.map((s) => (
            <li key={`${s.place_id}-${s.start}`}><button type="button" className="hl-row" onClick={door(s)}><b>{s.name}</b>{s.type && <span>{s.type.replace(/_/g, ' ')}</span>}<small>{s.hours < 1 ? `${Math.round(s.hours * 60)} min` : `${s.hours.toFixed(s.hours < 10 ? 1 : 0)} h`}</small></button></li>
          ))}
        </ol>
      )}
      {a.kind !== 'route' && <button type="button" className="btn quiet hl-open" onClick={door(a)}>{a.kind === 'farthest' && !a.is ? `Open ${a.city ?? dmy(a.date)}` : a.kind === 'back' && a.last ? 'Open the last visit' : 'Open on the map'}</button>}
    </Pass>
  )
}

interface Props {
  data: Data
  highlight: Highlight
  open: boolean
  onClose(): void
  onOpen: OpenDoor
}

/**
 * The "Ask for more" sheet: a menu of only the questions the record can answer about the
 * highlight; each answer prints as a pass and offers its own follow-ups, down to MAX_DEPTH.
 */
export function AskMoreDrawer({ data, highlight, open, onClose, onOpen }: Props) {
  const [chain, setChain] = useState<Step[]>([])
  const sheet = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => { setChain([]) }, [highlight])

  const cur = chain.length ? chain[chain.length - 1].h : highlight
  // Questions already asked since the thread last moved to another day.
  const asked = useMemo(() => {
    const out: FollowUpId[] = []
    for (const s of chain) { if (s.fu.answer.kind === 'highlight') out.length = 0; else out.push(s.fu.id) }
    return out
  }, [chain])
  const menu = useMemo(() => (open ? followUps(data, cur, chain.length, asked) : []), [data, cur, chain.length, asked, open])
  const crumbs = [highlight.city, ...chain.map((s) => (s.fu.answer.kind === 'highlight' ? s.fu.answer.highlight.city : CRUMB[s.fu.id]))]

  useEffect(() => {
    if (!open) return
    const was = document.activeElement as HTMLElement | null
    const first = sheet.current?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? sheet.current)?.focus()
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close.current() } }
    document.addEventListener('keydown', esc)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = prev; was?.focus?.() }
  }, [open])

  // Tab cycles inside the sheet while it is open.
  const trap = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !sheet.current) return
    const items = Array.from(sheet.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (!items.length) { e.preventDefault(); return }
    const first = items[0], last = items[items.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet.current)) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  const ask = (fu: FollowUp) => {
    setChain((c) => [...c, { fu, h: fu.answer.kind === 'highlight' ? fu.answer.highlight : cur }])
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => sheet.current?.querySelector<HTMLElement>('.hl-menu button, .hl-end')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }))
  }

  if (!open) return null
  return (
    <div className="hl-backdrop" onClick={onClose} data-testid="hl-backdrop">
      <div ref={sheet} className="hl-sheet" role="dialog" aria-modal="true" aria-label="Ask for more" tabIndex={-1} onClick={(e) => e.stopPropagation()} onKeyDown={trap}>
        <header className="hl-sheet-head">
          <nav className="hl-crumb caps" aria-label="Thread">{crumbs.map((c, i) => <span key={i}>{c}</span>)}</nav>
          <button type="button" className="hl-close" aria-label="Close" onClick={onClose}>×</button>
        </header>
        <div className="hl-sheet-body">
          <p className="hl-lede">{headline(cur)} <span className="hl-when">{dmy(cur.date)}{cur.scope === 'week' ? ' · this week' : ''}, {ago(cur.yearsAgo)}</span></p>
          {chain.map((s, i) => <AnswerPass key={i} data={data} step={s} onOpen={onOpen} />)}
          {menu.length > 0 ? (
            <div className="hl-menu" role="group" aria-label="Ask">
              {menu.map((f) => <button type="button" key={f.id} className="hl-q" onClick={() => ask(f)}>{f.question}</button>)}
            </div>
          ) : (
            <p className="hl-end caps" role="status">{chain.length >= MAX_DEPTH ? "That's as far as this thread goes." : 'Nothing more to ask about this one.'}</p>
          )}
        </div>
      </div>
    </div>
  )
}
