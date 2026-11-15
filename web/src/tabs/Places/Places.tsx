import { PlacePhoto } from '../../world/PlacePhoto'
import { useMemo, useState } from 'react'
import { useData } from '../../data/DataContext'
import { placeName } from '../../analytics/home'
import { isHome, isWork } from '../../analytics/geo'
import { Barcode, CountUp, Field, Pass, PrintIn, Sticker } from '../../world'
import { PlaceMap } from '../../world/PlaceMap'
import { date, hours, n0 } from '../../world/fmt'
import type { Place } from '../../data/types'
import { need } from '../../ingest/places'
import { useInView } from '../../world/useInView'

type Sort = 'visits' | 'hours' | 'recent' | 'first'
const SORT: Record<Sort, (a: Place, b: Place) => number> = {
  visits: (a, b) => b.n_visits - a.n_visits,
  hours: (a, b) => b.total_hours - a.total_hours,
  recent: (a, b) => b.last_ts - a.last_ts,
  first: (a, b) => b.first_ts - a.first_ts,
}
const PAGE = 48
const kind = (p: Place) => (isHome(p) ? 'Home' : isWork(p) ? 'Work' : p.primary_type?.replace(/_/g, ' ') ?? null)

export function Places() {
  const data = useData()
  const [city, setCity] = useState('')
  const [sort, setSort] = useState<Sort>('visits')
  const [named, setNamed] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE)

  const entries = useMemo(() => Object.entries(data.places), [data])
  const cities = useMemo(() => {
    const m = new Map<string, number>()
    for (const [, p] of entries) if (p.city) m.set(p.city, (m.get(p.city) ?? 0) + p.n_visits)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)
  }, [entries])
  const list = useMemo(() => entries
    .filter(([, p]) => (!city || p.city === city) && (!named || p.name))
    .sort((a, b) => SORT[sort](a[1], b[1])), [entries, city, named, sort])
  const sel = open ? data.places[open] : null
  const namedCount = entries.filter(([, p]) => p.name).length

  return (
    <main className="strip dense">
      {sel && open ? (
        <Pass stripe stub={
          <PrintIn>
            <Field label="Visits" big><CountUp value={sel.n_visits} /></Field>
            <Field label="Time there" big>{hours(sel.total_hours)}</Field>
            <Field label="First seen">{date(sel.first_ts)}</Field>
            <Field label="Last seen">{date(sel.last_ts)}</Field>
            <Barcode text={`PLC ${open.slice(0, 12).toUpperCase()} ${sel.n_visits}V`} />
          </PrintIn>
        }>
          <PrintIn>
            <div className="fields">
              <Field label="Place">{kind(sel) ?? 'unnamed stop'}</Field>
              <Field label="City">{sel.city}</Field>
              <Field label="Address">{sel.address}</Field>
            </div>
            <div className="big" style={{ fontSize: 'clamp(44px, 7vw, 96px)', lineHeight: 0.9 }}>{placeName(sel, open)}</div>
            <div className="two" style={{ marginTop: 32 }}>
              <PlaceMap place={sel} height={360} />
              <Sticker place={sel} name={placeName(sel, open)} sub={[sel.city, sel.country_code].filter(Boolean).join(', ') || 'city not on record'} tilt={1.5} />
            </div>
            <button className="btn quiet" onClick={() => setOpen(null)}>Back to all places</button>
          </PrintIn>
        </Pass>
      ) : (
        <Pass stripe stub={
          <PrintIn>
            <Field label="Places" big><CountUp value={entries.length} /></Field>
            <Field label="Named" big><CountUp value={namedCount} /></Field>
            <Field label="Cities" big><CountUp value={cities.length} /></Field>
          </PrintIn>
        }>
          <PrintIn>
            <div className="fields"><Field label="Luggage tags">One tag per place. Names come from Google Places where available.</Field></div>
            <div className="big"><CountUp value={list.length} /><small>{city ? city.toUpperCase() : 'PLACES'}</small></div>
            <div className="filters">
              <select value={city} onChange={(e) => { setCity(e.target.value); setLimit(PAGE) }} aria-label="City">
                <option value="">All cities</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
                <option value="visits">Most visits</option><option value="hours">Most time</option>
                <option value="recent">Recently seen</option><option value="first">Newest</option>
              </select>
              <button className="btn quiet" aria-pressed={named} onClick={() => setNamed(!named)}>Named only</button>
              <span className="count">{n0(list.length)} TAGS</span>
            </div>
          </PrintIn>
        </Pass>
      )}

      <div className="tags">
          {list.slice(0, limit).map(([id, p]) => <Tag key={id} id={id} p={p} places={data.places} pressed={open === id} onOpen={() => { setOpen(id); scrollTo({ top: 0, behavior: 'smooth' }) }} />)}
      </div>
      {limit < list.length && <button className="btn" onClick={() => setLimit(limit + PAGE)}>Print {Math.min(PAGE, list.length - limit)} more tags</button>}
    </main>
  )
}

/** One luggage tag; the place is looked up the first time the tag scrolls into view. */
function Tag({ id, p, places, pressed, onOpen }: { id: string; p: Place; places: Record<string, Place>; pressed: boolean; onOpen(): void }) {
  const ref = useInView<HTMLButtonElement>(() => need([id], places))
  return (
    <button ref={ref} className="tag" onClick={onOpen} aria-pressed={pressed}>
      <PlacePhoto place={p} />
      <div>
        <div className="lab">{kind(p) ?? (p.name ? 'place' : 'unnamed stop')}</div>
        <div className="name">{placeName(p, id)}</div>
        <div className="sub">{[p.city, p.country_code].filter(Boolean).join(', ') || 'city not on record'}</div>
      </div>
      <div className="row">
        <div className="field"><div className="lab">Visits</div><div className="val">{n0(p.n_visits)}</div></div>
        <div className="field"><div className="lab">Time</div><div className="val">{hours(p.total_hours)}</div></div>
        <div className="field"><div className="lab">Last</div><div className="val" style={{ fontSize: 16, marginTop: 8 }}>{date(p.last_ts).slice(0, 6)}</div></div>
      </div>
      <i className={`tape ${p.name ? '' : 'ghost'}`} />
    </button>
  )
}
