import { useMemo } from 'react'
import { useData } from '../../data/DataContext'
import { homeFacts, placeName } from '../../analytics/home'
import { tour } from '../../analytics/tour'
import { lensOf } from '../../analytics/lens'
import { Bill, CountUp, Field, Stamp, Sticker } from '../../world'
import { TrailMap } from '../../world/TrailMap'
import { Nights } from '../../world/Nights'
import { date, dateISO, label, n0 } from '../../world/fmt'
import { useStore } from '../../store/useStore'
import { YourRecord } from '../../app/YourRecord'
import { useProfile } from '../../profile/profile'
import { useUnits } from '../../profile/units'

const INK: Record<string, string> = { fly: 'red', foot: 'mustard', drive: '', transit: '' }
const yearSpan = ([a, b]: [number, number]) => (a === b ? String(a) : `${a}–${b}`)

/** Home is the poster: a stack of bills you peel through. */
export function Home() {
  const { u, cv } = useUnits()
  const data = useData()
  const f = useMemo(() => homeFacts(data), [data])
  const t = useMemo(() => tour(data), [data])
  const prof = useProfile()
  const name = prof?.name ?? ''
  const setTab = useStore((s) => s.setTab)
  const act = t.headline
  const actPlace = act ? data.places[act.place_id] : undefined
  const hoursTotal = f.hours.home + f.hours.work + f.hours.other + f.hours.transit
  const pct = (h: number) => Math.round((100 * h) / Math.max(1, hoursTotal))
  const sixStops = t.stops.slice(0, 6)

  return (
    <main className="bills">
      <Bill className="hero">
        <div className="two">
          <div>
            <h1 className={`title${name ? ' named' : ''}`}>{name ? <><span className="misreg">{name}'s</span><span className="misreg red">Elsewhere</span></> : <><span className="misreg">Else</span><span className="misreg red">where</span></>}</h1>
            <p className="lede sub">{yearSpan(t.years)}, live from {n0(f.days)} days of record. Everywhere your phone slept, every leg between. {n0(f.places)} places, {n0(f.cities)} cities, {n0(f.countries)} {f.countries === 1 ? 'country' : 'countries'}.</p>
            <TrailMap data={data} stops={t.stops} className="map drift" />
          </div>
          <div>
            <ol className="dates" aria-label="Where you slept">
              {sixStops.map((s) => (
                <li key={s.city}>
                  <span className="where">{s.city}{s.country && <small>{s.country}</small>}</span>
                  <span className="n">{s.nights}<small>{s.nights === 1 ? 'night' : 'nights'}</small></span>
                </li>
              ))}
              {t.stops.length > 6 && <li className="more"><button className="caps" style={{ color: 'inherit', letterSpacing: 'inherit' }} onClick={() => setTab('trips')}>+ {t.stops.length - 6} more cities →</button></li>}
              {!t.stops.length && <li className="more">No nights away on record</li>}
            </ol>
          </div>
        </div>
        <div className="foot">
          <span>{n0(f.cities)} cities · {n0(f.countries)} {f.countries === 1 ? 'country' : 'countries'}</span>
          <span><CountUp value={cv(f.totalKm)} /> {u}</span>
        </div>
        <Stamp top="Official record" big={String(t.years[1])} bottom="live" />
      </Bill>

      <Nights range={data.meta.range} name={name} />

      {act && (
        <Bill tone="ink">
          <div className="two">
            <div>
              <div className="caps">Headline act · farthest from home</div>
              <h2 className="word">{act.city}</h2>
              <p className="lede">{n0(cv(act.km))} {u} from home. {act.nights} {act.nights === 1 ? 'night' : 'nights'}, {date(act.start)} → {date(act.end)}.</p>
              <ol className="dates" style={{ marginTop: 40 }}>
                {f.longestTrip && <li><span className="where">Longest trip<small>{f.longestTrip.anchor_cities.slice(0, 2).join(' · ') || 'away'}</small></span><span className="n">{f.longestTrip.nights}<small>nights</small></span></li>}
                <li><span className="where">Nights away</span><span className="n">{n0(t.nightsAway)}</span></li>
                <li><span className="where">Nights home</span><span className="n">{n0(t.nightsHome)}</span></li>
                <li><span className="where">Trips</span><span className="n">{f.trips}</span></li>
              </ol>
            </div>
            <div style={{ display: 'grid', justifyItems: 'end', paddingTop: 24 }}>
              <Sticker place={actPlace} name={placeName(actPlace, act.place_id)} sub={[actPlace?.address, act.country].filter(Boolean).join(' · ') || null} tilt={2} onClick={() => setTab('places')}>
                <Stamp size="sm" top="" big={`${Math.round(cv(act.km) / 100) / 10}k`} bottom={`${u} out`} />
              </Sticker>
            </div>
          </div>
        </Bill>
      )}

      <Bill>
        <div className="caps">Setlist · {u === 'mi' ? 'miles' : 'kilometres'} by mode</div>
        <div className="num"><CountUp value={cv(f.totalKm)} /><small>{u}</small></div>
        <ol className="setlist" aria-label="Distance by mode">
          {f.kmByMode.map(([m, km]) => (
            <li key={m}>
              <span>{label(m)}</span>
              <span className="track"><i className={INK[lensOf(m)] ?? ''} style={{ width: `${(100 * km) / f.kmByMode[0][1]}%` }} /></span>
              <span className="n">{n0(cv(km))}<small>{u}</small></span>
            </li>
          ))}
        </ol>
        <div className="foot">
          <span>{(f.totalKm / 40075).toFixed(1)}× around the Earth</span>
          <span>{f.flights} {f.flights === 1 ? 'flight' : 'flights'}</span>
        </div>
      </Bill>

      <Bill tone="red">
        <div className="two">
          <div>
            <div className="caps">Residency · where the hours went</div>
            <div className="num"><CountUp value={f.hours.other} /><small>h out</small></div>
            <p className="lede">{pct(f.hours.home)}% home · {prof?.works.length ? `${pct(f.hours.work)}% work · ` : ''}{pct(f.hours.other)}% elsewhere · {pct(f.hours.transit)}% moving. About {(f.hours.other / Math.max(1, f.days)).toFixed(1)} hours a day somewhere else.</p>
          </div>
          <ol className="dates" aria-label="Most visited third places">
            {f.thirdPlaces.map((p) => (
              <li key={p.id}><span className="where">{p.name}{p.place.city && <small>{p.place.city}</small>}</span><span className="n">{p.place.n_visits}<small>visits</small></span></li>
            ))}
          </ol>
        </div>
      </Bill>

      <Bill>
        <div className="caps">Records · personal bests</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'center' }}>
          {f.records.longestDay && <Stamp top="Longest day" big={n0(cv(f.records.longestDay.km))} bottom={`${u} · ${dateISO(f.records.longestDay.date).slice(0, 6)}`} tone="ink" />}
          {f.records.busiestDay && <Stamp top="Busiest day" big={String(f.records.busiestDay.places)} bottom={`places · ${dateISO(f.records.busiestDay.date).slice(0, 6)}`} />}
          {f.records.farthest && <Stamp top="Farthest" big={n0(cv(f.records.farthest.km))} bottom={`${u} · ${f.records.farthest.city ?? 'away'}`} tone="ink" />}
        </div>
        <table className="ptable">
          <thead><tr><th>Year</th><th>{u}</th><th>Places</th><th>Trips</th><th>Flights</th></tr></thead>
          <tbody>
            {f.years.map((y) => <tr key={y.year}><td>{y.year}</td><td>{n0(cv(y.km))}</td><td>{n0(y.places)}</td><td>{y.trips}</td><td>{y.flights}</td></tr>)}
          </tbody>
        </table>
      </Bill>

      <Bill tone="ink" share={false} id="backstage">
        <div className="caps">Backstage · your record, your key</div>
        <div className="fields">
          <Field label="Name on the bill">{name || '—'}</Field>
          <Field label="Home">{prof?.homes.at(-1)?.city || '—'}</Field>
          <Field label="Record">{date(f.range[0])} → {date(f.range[1])}</Field>
        </div>
        <YourRecord />
      </Bill>
    </main>
  )
}

