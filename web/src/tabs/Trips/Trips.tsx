import { isHome } from '../../analytics/geo'
import { useMemo, useState } from 'react'
import { useData, useRawData } from '../../data/DataContext'
import { bedStrip } from '../../analytics/beds'
import { bedText } from '../../share/text'
import { Beds } from '../../world/figures/Figures'
import { placeName } from '../../analytics/home'
import { Barcode, CountUp, Field, Pass, PrintIn } from '../../world'
import { TripMap } from '../../world/TripMap'
import { date, label, n0 } from '../../world/fmt'

export function Trips() {
  const data = useData()
  const raw = useRawData()
  const [open, setOpen] = useState<number | null>(null)
  const trips = useMemo(() => [...data.trips].sort((a, b) => b.start - a.start), [data])
  const nights = trips.reduce((a, t) => a + t.nights, 0)
  const flightsIn = (s: number, e: number) => data.activities.filter((a) => a.mode === 'FLYING' && a.start >= s && a.start <= e).length
  const visitedIn = (s: number, e: number) => {
    const seen = new Map<string, number>()
    for (const v of data.visits) if (v.lvl === 0 && v.start >= s && v.start <= e && !isHome(data.places[v.place_id])) seen.set(v.place_id, (seen.get(v.place_id) ?? 0) + 1)
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  }

  return (
    <main className="strip dense">
      <Pass stripe stub={
        <PrintIn>
          <Field label="Trips" big><CountUp value={trips.length} /></Field>
          <Field label="Nights away" big><CountUp value={nights} /></Field>
          <Field label="Flights" big><CountUp value={data.activities.filter((a) => a.mode === 'FLYING').length} /></Field>
        </PrintIn>
      }>
        <PrintIn>
          <div className="fields"><Field label="Trips">Nights spent more than 100 km from home, newest first</Field></div>
          <div className="big"><CountUp value={nights} /><small>NIGHTS AWAY</small></div>
          <div className="route">{[...new Set(trips.flatMap((t) => t.anchor_cities[0] ? [t.anchor_cities[0]] : []))].slice(0, 4).map((c, i) => <span key={c}>{i > 0 && <span className="arrow">→ </span>}{c}</span>)}</div>
        </PrintIn>
      </Pass>

      {trips.map((t, i) => {
        const isOpen = open === i
        const km = Object.entries(t.total_km_by_mode).sort((a, b) => b[1] - a[1])
        const total = km.reduce((a, [, v]) => a + v, 0)
        const dest = t.anchor_cities.slice(0, 3)
        const strip = () => bedStrip(raw, [t.start, t.end])
        const text = () => bedText(strip(), `${dest.join(' → ') || 'TRIP'} · ${date(t.start)}`.toUpperCase())
        return (
          <Pass key={t.start} className={`click ${isOpen ? 'open' : ''}`} text={text} stub={
            <PrintIn>
              <Field label="Nights" big><CountUp value={t.nights} /></Field>
              <Field label="Flights" big>{flightsIn(t.start, t.end)}</Field>
              <Field label="Farthest" big>{n0(t.max_dist_from_home_km)}<small style={{ fontSize: '0.4em' }}> KM</small></Field>
              <Barcode text={`TRIP ${date(t.start).replace(/ /g, '')} ${t.nights}N ${n0(total).replace(',', '')}KM`} />
            </PrintIn>
          }>
            <div onClick={() => setOpen(isOpen ? null : i)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(isOpen ? null : i) } }} aria-expanded={isOpen}>
              <PrintIn>
                <div className="fields">
                  <Field label="Departed">{date(t.start)}</Field>
                  <Field label="Returned">{date(t.end)}</Field>
                  <Field label="Distance">{n0(total)} km</Field>
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
                        <div className="bar" key={m}><span className="lab">{label(m)}</span><span className="track"><i className={j === 0 ? 'orange' : j === 1 ? 'blue' : ''} style={{ width: `${(100 * v) / km[0][1]}%` }} /></span><span className="num">{n0(v)} km</span></div>
                      ))}
                    </div>
                    <ol className="plist">
                      {visitedIn(t.start, t.end).map(([id, n], j) => (
                        <li key={id}><span className="rank">0{j + 1}</span><span><div className="name">{placeName(data.places[id], id)}</div><div className="sub">{data.places[id]?.city ?? ''}</div></span><span className="n">{n}</span></li>
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
