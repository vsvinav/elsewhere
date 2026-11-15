import { useEffect, useRef, useState, type KeyboardEvent, type UIEvent } from 'react'
import type { Data } from '../../data/types'
import { TripMap } from '../../world/TripMap'
import { Door } from '../../world/Door'
import { date, n0 } from '../../world/fmt'
import { useUnits } from '../../profile/units'
import { compare, type Card, type Compared } from './deck'
import './deck.css'

const STATS: { key: keyof Compared; label: string }[] = [
  { key: 'nights', label: 'Nights' }, { key: 'km', label: 'Distance' }, { key: 'flights', label: 'Flights' }, { key: 'farthest', label: 'Farthest' },
]

function Stat({ label, win, children }: { label: string; win: boolean; children: React.ReactNode }) {
  return (
    <div className="field">
      <div className="lab">{label}{win && <span className="win" role="img" aria-label="Beats the trip before">✓</span>}</div>
      <div className="val n">{children}</div>
    </div>
  )
}

/**
 * The trips as a hand of cards: swipe (or arrow) along them, newest first. Each card is compared with the
 * older card beside it, a mustard tick on every stat it wins. Tapping a card opens its pass below; MAP opens the map on it.
 */
export function TripDeck({ cards, data, onOpen }: { cards: Card[]; data: Data; onOpen(card: Card): void }) {
  const { u, U, cv } = useUnits()
  const [selected, setSelected] = useState(0)
  const row = useRef<HTMLDivElement>(null)
  const n = cards.length
  useEffect(() => { if (selected >= n) setSelected(Math.max(0, n - 1)) }, [n, selected])

  const go = (i: number) => {
    const k = Math.max(0, Math.min(n - 1, i))
    setSelected(k)
    const el = row.current?.children[k] as HTMLElement | undefined
    el?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(selected + 1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(selected - 1) }
  }
  // After a swipe the nearest card to the middle becomes the selected one.
  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget, mid = el.scrollLeft + el.clientWidth / 2
    let best = 0, dist = Infinity
    Array.from(el.children).forEach((c, i) => { const h = c as HTMLElement; const d = Math.abs(h.offsetLeft + h.offsetWidth / 2 - mid); if (d < dist) { dist = d; best = i } })
    if (best !== selected) setSelected(best)
  }

  return (
    <div className="deck">
      <div ref={row} className="deck-row" role="listbox" aria-label="Trip deck" aria-orientation="horizontal" tabIndex={0} onKeyDown={onKey} onScroll={onScroll} aria-activedescendant={n ? `deck-${cards[selected]?.tripId}` : undefined}>
        {!n && <div className="deck-empty ghost">No trips match</div>}
        {cards.map((c, i) => {
          const prev = cards[i + 1]
          const won = prev ? compare(c, prev) : null
          const label = `${c.title} · ${c.nights} night${c.nights === 1 ? '' : 's'}`
          return (
            <article key={c.tripId} id={`deck-${c.tripId}`} role="option" aria-selected={i === selected} className={`deck-card ${i === selected ? 'is-selected' : ''}`} onFocus={() => setSelected(i)}>
              <div className="deck-head">
                <div className="caps">{date(c.departed)} <span className="arrow">→</span> {date(c.returned)}</div>
                <h3 className="display">{c.title}</h3>
              </div>
              <TripMap data={data} range={[c.departed, c.returned]} height={100} />
              <div className="deck-stats">
                {STATS.map(({ key, label: l }) => (
                  <Stat key={key} label={l} win={won?.[key] === 1}>
                    {key === 'nights' ? c.nights : key === 'flights' ? c.flights : <>{n0(cv(key === 'km' ? c.km : c.farthestKm))}<small> {key === 'km' ? u : U}</small></>}
                  </Stat>
                ))}
              </div>
              <div className="deck-foot">
                <button type="button" className="deck-open" onClick={() => { setSelected(i); onOpen(c) }} aria-label={`Open trip ${c.title}`}>Open trip →</button>
                <Door target={{ kind: 'trip', tripId: c.tripId, from: c.departed, to: c.returned, label }} className="deck-map">Map</Door>
              </div>
            </article>
          )
        })}
      </div>
      {n > 0 && <div className="deck-nav">
        <button type="button" onClick={() => go(selected - 1)} disabled={selected === 0} aria-label="Previous trip">←</button>
        <span className="caps">{selected + 1} of {n}</span>
        <button type="button" onClick={() => go(selected + 1)} disabled={selected >= n - 1} aria-label="Next trip">→</button>
      </div>}
    </div>
  )
}
