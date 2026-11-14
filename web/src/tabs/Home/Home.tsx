import { useMemo, useState } from 'react'
import { useData } from '../../data/DataContext'
import { homeFacts } from '../../analytics/home'
import { Barcode, CountUp, Field, Pass, PrintIn } from '../../world'
import { TrailMap } from '../../world/TrailMap'
import { date, dateISO, label, n0 } from '../../world/fmt'
import { YourRecord } from '../../app/YourRecord'

export function Home() {
  const data = useData()
  const f = useMemo(() => homeFacts(data), [data])
  const [name, setName] = useState(() => localStorage.getItem('elsewhere.name') ?? '')
  const code = `ELSW ${date(f.range[0]).replace(/ /g, '')} ${date(f.range[1]).replace(/ /g, '')} ${data.meta.source_sha256.slice(0, 8).toUpperCase()}`
  const topMode = f.kmByMode[0]
  const hoursTotal = f.hours.home + f.hours.work + f.hours.other + f.hours.transit
  const pct = (h: number) => (100 * h) / Math.max(1, hoursTotal)

  return (
    <main className="strip">
      <Pass stripe stub={
        <PrintIn>
          <Field label="Flights" big><CountUp value={f.flights} /></Field>
          <Field label="Trips" big><CountUp value={f.trips} /></Field>
          <Field label="Places" big><CountUp value={f.places} /></Field>
          <Field label="Countries" big><CountUp value={f.countries} /></Field>
          <Barcode text={code} />
        </PrintIn>
      }>
        <PrintIn>
          <div className="fields">
            <div className="field">
              <div className="lab">Passenger</div>
              <input className="val" value={name} placeholder="add your name" aria-label="Passenger name"
                onChange={(e) => { setName(e.target.value); localStorage.setItem('elsewhere.name', e.target.value) }} />
            </div>
            <Field label="Record">{date(f.range[0])} → {date(f.range[1])} · {n0(f.days)} days</Field>
            <Field label="Issued by">elsewhere</Field>
          </div>
          <div className="big"><CountUp value={f.totalKm} /><small>KM</small></div>
          <div className="route">
            {f.topCities.map((c, i) => <span key={c}>{i > 0 && <span className="arrow">→ </span>}{c}</span>)}
          </div>
          <TrailMap data={data} />
        </PrintIn>
      </Pass>

      <Pass stub={
        <PrintIn>
          {f.kmByMode.slice(0, 3).map(([m, km]) => (
            <Field key={m} label={label(m)} big>{Math.round((100 * km) / f.totalKm)}<small style={{ fontSize: '0.5em' }}>%</small></Field>
          ))}
          <Field label="Around the Earth" big>{(f.totalKm / 40075).toFixed(1)}×</Field>
        </PrintIn>
      }>
        <PrintIn>
          <div className="fields"><Field label="Mostly by">{topMode ? label(topMode[0]) : ''}</Field><Field label="Modes on record">{f.kmByMode.length}</Field></div>
          <div className="big"><CountUp value={topMode?.[1] ?? 0} /><small>KM {topMode ? label(topMode[0]).toUpperCase() : ''}</small></div>
          <div className="bars">
            {f.kmByMode.map(([m, km], i) => (
              <div className="bar" key={m}>
                <span className="lab">{label(m)}</span>
                <span className="track"><i className={i === 0 ? 'orange' : i === 1 ? 'blue' : ''} style={{ width: `${(100 * km) / f.kmByMode[0][1]}%` }} /></span>
                <span className="num">{n0(km)} km</span>
              </div>
            ))}
          </div>
        </PrintIn>
      </Pass>

      <Pass stub={
        <PrintIn>
          <Field label="Most visited" big>{f.thirdPlaces[0] ? <CountUp value={f.thirdPlaces[0].place.n_visits} /> : null}</Field>
          <Field label="Place">{f.thirdPlaces[0]?.name}</Field>
          <Field label="Cities" big><CountUp value={f.cities} /></Field>
        </PrintIn>
      }>
        <PrintIn>
          <div className="fields"><Field label="Third places">Not home, not work</Field><Field label="Enriched">{Object.values(data.places).filter((p) => p.name).length} of {Object.keys(data.places).length} named</Field></div>
          <div className="big"><CountUp value={f.places} /><small>PLACES</small></div>
          <ol className="plist">
            {f.thirdPlaces.map((p, i) => (
              <li key={p.id}>
                <span className="rank">0{i + 1}</span>
                <span><div className="name">{p.name}</div><div className="sub">{[p.place.city, p.place.address].filter(Boolean).join(' · ') || 'address not on record'}</div></span>
                <span className="n">{p.place.n_visits} <small style={{ font: '500 13px var(--body)', color: 'var(--ink-3)' }}>visits</small></span>
              </li>
            ))}
          </ol>
        </PrintIn>
      </Pass>

      <Pass stub={
        <PrintIn>
          <Field label="Home" big>{Math.round(pct(f.hours.home))}%</Field>
          <Field label="Work" big>{Math.round(pct(f.hours.work))}%</Field>
          <Field label="Elsewhere" big>{Math.round(pct(f.hours.other))}%</Field>
          <Field label="In transit" big>{Math.round(pct(f.hours.transit))}%</Field>
        </PrintIn>
      }>
        <PrintIn>
          <div className="fields"><Field label="Time budget">{n0(hoursTotal)} hours on record</Field><Field label="Per day">{(f.hours.other / Math.max(1, f.days)).toFixed(1)} h elsewhere</Field></div>
          <div className="big"><CountUp value={f.hours.other} /><small>H ELSEWHERE</small></div>
          <div className="strip100" aria-hidden>
            <span className="home" style={{ width: `${pct(f.hours.home)}%` }}>Home</span>
            <span className="work" style={{ width: `${pct(f.hours.work)}%` }}>Work</span>
            <span className="other" style={{ width: `${pct(f.hours.other)}%` }}>Elsewhere</span>
            <span className="transit" style={{ width: `${pct(f.hours.transit)}%` }}>Transit</span>
          </div>
        </PrintIn>
      </Pass>

      {f.longestTrip && (
        <Pass stub={
          <PrintIn>
            <Field label="Departed">{date(f.longestTrip.start)}</Field>
            <Field label="Returned">{date(f.longestTrip.end)}</Field>
            <Field label="Farthest from home" big>{n0(f.longestTrip.max_dist_from_home_km)}<small style={{ fontSize: '0.4em' }}> KM</small></Field>
            <Barcode text={`TRIP ${date(f.longestTrip.start).replace(/ /g, '')} ${f.longestTrip.nights}N`} />
          </PrintIn>
        }>
          <PrintIn>
            <div className="fields"><Field label="Longest trip">{f.longestTrip.anchor_cities.join(' · ') || 'destination not on record'}</Field></div>
            <div className="big"><CountUp value={f.longestTrip.nights} /><small>NIGHTS</small></div>
            <div className="route">{f.longestTrip.anchor_cities.slice(0, 3).map((c, i) => <span key={c}>{i > 0 && <span className="arrow">→ </span>}{c}</span>)}</div>
          </PrintIn>
        </Pass>
      )}

      <Pass stub={
        <PrintIn>
          <Field label="Longest day">{f.records.longestDay ? dateISO(f.records.longestDay.date) : null}</Field>
          <Field label="Busiest day">{f.records.busiestDay ? dateISO(f.records.busiestDay.date) : null}</Field>
          <Field label="Farthest from home">{f.records.farthest?.city}</Field>
        </PrintIn>
      }>
        <PrintIn>
          <div className="fields"><Field label="Records">Personal bests on record</Field></div>
          <table className="ptable">
            <thead><tr><th>Record</th><th>Value</th></tr></thead>
            <tbody>
              <tr><td>Longest day</td><td>{f.records.longestDay ? n0(f.records.longestDay.km) : '—'}<small>km</small></td></tr>
              <tr><td>Busiest day</td><td>{f.records.busiestDay?.places ?? '—'}<small>places</small></td></tr>
              <tr><td>Farthest</td><td>{f.records.farthest ? n0(f.records.farthest.km) : '—'}<small>km from home</small></td></tr>
            </tbody>
          </table>
        </PrintIn>
      </Pass>

      <Pass>
        <PrintIn>
          <div className="fields"><Field label="Year over year">{f.years.length} {f.years.length === 1 ? 'year' : 'years'} on record</Field></div>
          <table className="ptable">
            <thead><tr><th>Year</th><th>km</th><th>Places</th><th>Trips</th><th>Flights</th></tr></thead>
            <tbody>
              {f.years.map((y) => (
                <tr key={y.year}><td>{y.year}</td><td>{n0(y.km)}</td><td>{n0(y.places)}</td><td>{y.trips}</td><td>{y.flights}</td></tr>
              ))}
            </tbody>
          </table>
        </PrintIn>
      </Pass>

      <YourRecord />
    </main>
  )
}
