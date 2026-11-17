import { isHome } from '../../analytics/geo'
import { useMemo, useState } from 'react'
import { useData, useRawData } from '../../data/DataContext'
import { bedStrip } from '../../analytics/beds'
import { bedText } from '../../share/text'
import { Beds } from '../../world/figures/Figures'
import { placeName } from '../../analytics/home'
import { Barcode, CountUp, Field, Pass, PrintIn } from '../../world'
import { TripMap } from '../../world/TripMap'
import { date, n0 } from '../../world/fmt'
import { kmByLabel } from '../../data/modes'
import { useUnits } from '../../profile/units'
import { PlaceRow } from '../../world/PlaceRow'
import { tripId } from '../../analytics/doors'
import { deckCards, searchCards, type Card } from './deck'
import { TripDeck } from './TripDeck'

export function Trips() {
  const { u, U, cv } = useUnits()
  const data = useData()
  const raw = useRawData()
  const [open, setOpen] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const trips = useMemo(() => [...data.trips].sort((a, b) => b.start - a.start), [data])
  const cards = useMemo(() => deckCards(data), [data])
  const shown = useMemo(() => searchCards(cards, q), [cards, q])
  const byId = useMemo(() => new Map(cards.map((c) => [c.tripId, c])), [cards])
  const listed = useMemo(() => { const keep = new Set(shown.map((c) => c.tripId)); return trips.filter((t) => keep.has(tripId(t))) }, [trips, shown])
  const nights = trips.reduce((a, t) => a + t.nights, 0)
  const openCard = (c: Card) => {
    setOpen(c.tripId)
    document.getElementById(`trip-${c.tripId}`)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }
  const visitedIn = (s: number, e: number) => {
    const seen = new Map<string, number>()
    for (const v of data.visits) if (v.lvl === 0 && v.start >= s && v.start <= e && !isHome(data.places[v.place_id])) seen.set(v.place_id, (seen.get(v.place_id) ?? 0) + 1)
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  }

  return (
    <main className="strip dense">
      <label className="deck-search">
        <span className="caps">Search</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="lisbon 2024" aria-label="Search trips" autoComplete="off" />
        <span className="n">{shown.length === cards.length ? `${cards.length} TRIPS` : `${shown.length} OF ${cards.length}`}</span>
      </label>
      <TripDeck cards={shown} data={data} onOpen={openCard} />

      <Pass stripe stub={
        <PrintIn>
          <Field label="Trips" big><CountUp value={trips.length} /></Field>
          <Field label="Nights away" big><CountUp value={nights} /></Field>
          <Field label="Flights" big><CountUp value={data.activities.filter((a) => a.mode === 'FLYING').length} /></Field>
        </PrintIn>
      }>
        <PrintIn>
          <div className="fields"><Field label="Trips">Nights spent more than {n0(cv(100))} {u} from home, newest first</Field></div>
          <div className="big"><CountUp value={nights} /><small>NIGHTS AWAY</small></div>
          <div className="route">{[...new Set(trips.flatMap((t) => t.anchor_cities[0] ? [t.anchor_cities[0]] : []))].slice(0, 4).map((c, i) => <span key={c}>{i > 0 && <span className="arrow">→ </span>}{c}</span>)}</div>
        </PrintIn>
      </Pass>

      {listed.map((t) => {
        const id = tripId(t)
        const card = byId.get(id)!
        const isOpen = open === id
        const km = kmByLabel(t.total_km_by_mode)
        const total = card.km
        const dest = t.anchor_cities.slice(0, 3)
        const strip = () => bedStrip(raw, [t.start, t.end])
        const text = () => bedText(strip(), `${dest.join(' → ') || 'TRIP'} · ${date(t.start)}`.toUpperCase())
        return (
          <Pass key={id} id={`trip-${id}`} className={`click ${isOpen ? 'open' : ''}`} text={text} stub={
            <PrintIn>
              <Field label="Nights" big><CountUp value={t.nights} /></Field>
              <Field label="Flights" big>{card.flights}</Field>
              <Field label="Farthest" big>{n0(cv(t.max_dist_from_home_km))}<small style={{ fontSize: '0.4em' }}> {U}</small></Field>
              <Barcode text={`TRIP ${date(t.start).replace(/ /g, '')} ${t.nights}N ${n0(total).replace(',', '')}KM`} />
            </PrintIn>
          }>
            <div onClick={() => setOpen(isOpen ? null : id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(isOpen ? null : id) } }} aria-expanded={isOpen} aria-label={`${isOpen ? 'Close' : 'Open'} pass · ${card.title}`}>
              <PrintIn>
                <div className="fields">
                  <Field label="Departed">{date(t.start)}</Field>
                  <Field label="Returned">{date(t.end)}</Field>
                  <Field label="Distance">{n0(cv(total))} {u}</Field>
                </div>
                <div className="route" style={{ marginTop: 18 }}>
                  {dest.length ? dest.map((c, j) => <span key={c}>{j > 0 && <span className="arrow">→ </span>}{c}</span>) : <span className="ghost">destination not on record</span>}
                </div>
                {isOpen ? (
                  <>
                    <TripMap data={data} range={[t.start, t.end]} />
                    <Beds nights={strip()} className="trip" />
                    <div className="bars">
                      {km.slice(0, 4).map(([m, v], j) => (
                        <div className="bar" key={m}><span className="lab">{m}</span><span className="track"><i className={j === 0 ? 'orange' : j === 1 ? 'blue' : ''} style={{ width: `${(100 * v) / km[0][1]}%` }} /></span><span className="num">{n0(cv(v))} {u}</span></div>
                      ))}
                    </div>
                    <ol className="plist">
                      {visitedIn(t.start, t.end).map(([id, n], j) => (
                        <PlaceRow key={id} id={id} places={data.places}><span className="rank">0{j + 1}</span><span><div className="name">{placeName(data.places[id], id)}</div><div className="sub">{data.places[id]?.city ?? ''}</div></span><span className="n">{n}</span></PlaceRow>
                      ))}
                    </ol>
                  </>
                ) : <div className="more">Open trip →</div>}
              </PrintIn>
            </div>
          </Pass>
        )
      })}
    </main>
  )
}
