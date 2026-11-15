import { useMemo } from 'react'
import { useData, useRawData } from '../../data/DataContext'
import { homeFacts, placeName } from '../../analytics/home'
import { tour } from '../../analytics/tour'
import { lensOf } from '../../analytics/lens'
import { Bill, CountUp, Field, Stamp, Sticker } from '../../world'
import { TrailMap } from '../../world/TrailMap'
import { Nights } from '../../world/Nights'
import { YearWheel } from '../../world/YearWheel'
import { date, dateISO, label, n0 } from '../../world/fmt'
import { useStore } from '../../store/useStore'
import { YourRecord } from '../../app/YourRecord'
import { useProfile } from '../../profile/profile'
import { useUnits } from '../../profile/units'
import { PlaceRow } from '../../world/PlaceRow'
import { Door } from '../../world/Door'
import { dateRange, onePerCity, onePerCountry, tripId } from '../../analytics/doors'
import { isHome } from '../../analytics/geo'
import type { Door as Target } from '../../store/useStore'

const INK: Record<string, string> = { fly: 'red', foot: 'mustard', drive: '', transit: '' }
const yearSpan = ([a, b]: [number, number]) => (a === b ? String(a) : `${a}–${b}`)

/** Home is the poster: a stack of bills you peel through. */
export function Home() {
  const { u, cv } = useUnits()
  const data = useData()
  const raw = useRawData()
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
  // Where each figure leads; one pass over the place book per record, not per render.
  const d = useMemo(() => {
    const [r0, r1] = data.meta.range
    const whole = (label: string): Target => ({ kind: 'range', from: r0, to: r1, label })
    const year = (y: number, label: string): Target => ({ kind: 'range', from: Math.max(r0, Date.UTC(y, 0, 1) / 1000), to: Math.min(r1, Date.UTC(y + 1, 0, 1) / 1000 - 1), label })
    const day = (date: string, label: string): Target => { const [a, b] = dateRange(date); return { kind: 'range', from: a, to: b, label } }
    const countries = onePerCountry(data.places), cities = onePerCity(data.places)
    const homes = Object.entries(data.places).filter(([, p]) => isHome(p)).map(([id]) => id)
    const ctry = `${n0(f.countries)} ${f.countries === 1 ? 'country' : 'countries'}`
    return {
      whole, year, day,
      days: whole(`${n0(f.days)} days of record`),
      places: { kind: 'places', placeIds: Object.keys(data.places), label: `${n0(f.places)} places` } as Target,
      cities: { kind: 'places', placeIds: cities, label: `${n0(f.cities)} cities` } as Target,
      countries: { kind: 'places', placeIds: countries, label: ctry } as Target,
      stop: (s: (typeof t.stops)[number]): Target => ({ kind: 'range', from: s.first, to: s.last, label: `${s.city} · ${s.nights} ${s.nights === 1 ? 'night' : 'nights'}` }),
      nightsAway: { kind: 'places', placeIds: t.stops.flatMap((s) => s.placeIds), label: `${n0(t.nightsAway)} nights away` } as Target,
      nightsHome: homes.length ? ({ kind: 'places', placeIds: homes, label: `${n0(t.nightsHome)} nights home` } as Target) : whole(`${n0(t.nightsHome)} nights home`),
      longestTrip: f.longestTrip ? ({ kind: 'trip', tripId: tripId(f.longestTrip), from: f.longestTrip.start, to: f.longestTrip.end, label: `Longest trip · ${f.longestTrip.nights} nights` } as Target) : null,
      act: act ? ({ kind: 'place', placeId: act.place_id, at: act.start, label: `${act.city} · ${n0(cv(act.km))} ${u} from home` } as Target) : null,
      actNights: act ? ({ kind: 'range', from: act.start, to: act.end, label: `${act.city} · ${act.nights} ${act.nights === 1 ? 'night' : 'nights'}` } as Target) : null,
    }
  }, [data, f, t, act, cv, u])

  return (
    <main className="bills">
      <Bill className="hero">
        <div className="two">
          <div>
            <h1 className={`title${name ? ' named' : ''}`}>{name ? <><span className="misreg">{name}'s</span><span className="misreg red">Elsewhere</span></> : <><span className="misreg">Else</span><span className="misreg red">where</span></>}</h1>
            <YearWheel range={raw.meta.range} />
            <p className="lede sub">{yearSpan(t.years)}, live from <Door target={d.days}>{n0(f.days)} days</Door> of record. Everywhere your phone slept, every leg between. <Door target={d.places}>{n0(f.places)} places</Door>, <Door target={d.cities}>{n0(f.cities)} cities</Door>, <Door target={d.countries}>{n0(f.countries)} {f.countries === 1 ? 'country' : 'countries'}</Door>.</p>
            <TrailMap data={data} stops={t.stops} className="map drift" />
          </div>
          <div>
            <ol className="dates" aria-label="Where you slept">
              {sixStops.map((s) => (
                <li key={s.city}><Door className="row" target={d.stop(s)}>
                  <span className="where">{s.city}{s.country && <small>{s.country}</small>}</span>
                  <span className="n">{s.nights}<small>{s.nights === 1 ? 'night' : 'nights'}</small></span>
                </Door></li>
              ))}
              {t.stops.length > 6 && <li className="more"><button className="caps" style={{ color: 'inherit', letterSpacing: 'inherit' }} onClick={() => setTab('trips')}>+ {t.stops.length - 6} more cities →</button></li>}
              {!t.stops.length && <li className="more">No nights away on record</li>}
            </ol>
          </div>
        </div>
        <div className="foot">
          <span><Door target={d.cities}>{n0(f.cities)} cities</Door> · <Door target={d.countries}>{n0(f.countries)} {f.countries === 1 ? 'country' : 'countries'}</Door></span>
          <span><Door target={d.whole(`${n0(cv(f.totalKm))} ${u}`)}><CountUp value={cv(f.totalKm)} /> {u}</Door></span>
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
              <p className="lede"><Door target={d.act!}>{n0(cv(act.km))} {u} from home</Door>. <Door target={d.actNights!}>{act.nights} {act.nights === 1 ? 'night' : 'nights'}, {date(act.start)} → {date(act.end)}</Door>.</p>
              <ol className="dates" style={{ marginTop: 40 }}>
                {f.longestTrip && d.longestTrip && <li><Door className="row" target={d.longestTrip}><span className="where">Longest trip<small>{f.longestTrip.anchor_cities.slice(0, 2).join(' · ') || 'away'}</small></span><span className="n">{f.longestTrip.nights}<small>nights</small></span></Door></li>}
                <li><Door className="row" target={d.nightsAway}><span className="where">Nights away</span><span className="n">{n0(t.nightsAway)}</span></Door></li>
                <li><Door className="row" target={d.nightsHome}><span className="where">Nights home</span><span className="n">{n0(t.nightsHome)}</span></Door></li>
                <li><Door className="row" target={d.whole(`${f.trips} ${f.trips === 1 ? 'trip' : 'trips'}`)}><span className="where">Trips</span><span className="n">{f.trips}</span></Door></li>
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
        <div className="num"><Door target={d.whole(`${n0(cv(f.totalKm))} ${u} on record`)}><CountUp value={cv(f.totalKm)} /><small>{u}</small></Door></div>
        <ol className="setlist" aria-label="Distance by mode">
          {f.kmByMode.map(([m, km]) => (
            <li key={m}><Door className="row" target={d.whole(`${label(m)} · ${n0(cv(km))} ${u}`)}>
              <span>{label(m)}</span>
              <span className="track"><i className={INK[lensOf(m)] ?? ''} style={{ width: `${(100 * km) / f.kmByMode[0][1]}%` }} /></span>
              <span className="n">{n0(cv(km))}<small>{u}</small></span>
            </Door></li>
          ))}
        </ol>
        <div className="foot">
          <span><Door target={d.whole(`${(f.totalKm / 40075).toFixed(1)}× around the Earth`)}>{(f.totalKm / 40075).toFixed(1)}× around the Earth</Door></span>
          <span><Door target={d.whole(`${f.flights} ${f.flights === 1 ? 'flight' : 'flights'}`)}>{f.flights} {f.flights === 1 ? 'flight' : 'flights'}</Door></span>
        </div>
      </Bill>

      <Bill tone="red">
        <div className="two">
          <div>
            <div className="caps">Residency · where the hours went</div>
            <div className="num"><Door target={d.whole(`${n0(f.hours.other)} hours out`)}><CountUp value={f.hours.other} /><small>h out</small></Door></div>
            <p className="lede">{pct(f.hours.home)}% home · {prof?.works.length ? `${pct(f.hours.work)}% work · ` : ''}{pct(f.hours.other)}% elsewhere · {pct(f.hours.transit)}% moving. About {(f.hours.other / Math.max(1, f.days)).toFixed(1)} hours a day somewhere else.</p>
          </div>
          <ol className="dates" aria-label="Most visited third places">
            {f.thirdPlaces.map((p) => (
              <PlaceRow key={p.id} id={p.id} places={data.places}><Door className="row" target={{ kind: 'place', placeId: p.id, label: `${p.name} · ${p.place.n_visits} visits` }}><span className="where">{p.name}{p.place.city && <small>{p.place.city}</small>}</span><span className="n">{p.place.n_visits}<small>visits</small></span></Door></PlaceRow>
            ))}
          </ol>
        </div>
      </Bill>

      <Bill>
        <div className="caps">Records · personal bests</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'center' }}>
          {f.records.longestDay && <Door className="block" target={d.day(f.records.longestDay.date, `Longest day · ${n0(cv(f.records.longestDay.km))} ${u}`)}><Stamp top="Longest day" big={n0(cv(f.records.longestDay.km))} bottom={`${u} · ${dateISO(f.records.longestDay.date).slice(0, 6)}`} tone="ink" /></Door>}
          {f.records.busiestDay && <Door className="block" target={d.day(f.records.busiestDay.date, `Busiest day · ${f.records.busiestDay.places} places`)}><Stamp top="Busiest day" big={String(f.records.busiestDay.places)} bottom={`places · ${dateISO(f.records.busiestDay.date).slice(0, 6)}`} /></Door>}
          {f.records.farthest && act && <Door className="block" target={d.act!}><Stamp top="Farthest" big={n0(cv(f.records.farthest.km))} bottom={`${u} · ${f.records.farthest.city ?? 'away'}`} tone="ink" /></Door>}
          {f.records.farthest && !act && <Stamp top="Farthest" big={n0(cv(f.records.farthest.km))} bottom={`${u} · ${f.records.farthest.city ?? 'away'}`} tone="ink" />}
        </div>
        <table className="ptable">
          <thead><tr><th>Year</th><th>{u}</th><th>Places</th><th>Trips</th><th>Flights</th></tr></thead>
          <tbody>
            {f.years.map((y) => {
              const yr = (label: string) => d.year(y.year, `${y.year} · ${label}`)
              return <tr key={y.year}><td><Door target={yr(`${n0(cv(y.km))} ${u} · ${n0(y.places)} places · ${y.trips} trips · ${y.flights} flights`)}>{y.year}</Door></td><td><Door target={yr(`${n0(cv(y.km))} ${u}`)}>{n0(cv(y.km))}</Door></td><td><Door target={yr(`${n0(y.places)} places`)}>{n0(y.places)}</Door></td><td><Door target={yr(`${y.trips} trips`)}>{y.trips}</Door></td><td><Door target={yr(`${y.flights} flights`)}>{y.flights}</Door></td></tr>
            })}
          </tbody>
        </table>
      </Bill>

      <Bill tone="ink" share={false} id="backstage">
        <div className="caps">Backstage · your record, your key</div>
        <div className="fields">
          <Field label="Name on the bill">{name || '—'}</Field>
          <Field label="Home">{prof?.homes.at(-1)?.city || '—'}</Field>
          <Field label="Record"><Door target={d.whole(`${date(f.range[0])} → ${date(f.range[1])}`)}>{date(f.range[0])} → {date(f.range[1])}</Door></Field>
        </div>
        <YourRecord />
      </Bill>
    </main>
  )
}


