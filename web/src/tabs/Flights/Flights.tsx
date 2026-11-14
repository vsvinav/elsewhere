import { useEffect, useMemo, useState } from 'react'
import { useData } from '../../data/DataContext'
import { flights } from '../../world/flights'
import { FlightMap } from '../../world/FlightMap'
import { Bill, CountUp } from '../../world'
import { n0 } from '../../world/fmt'

/** The air record as a poster page: the earth, then each neighbourhood of airports, then the ledger. */
export function Flights() {
  const data = useData()
  const { hops, ports } = useMemo(() => flights(data), [data])
  const km = hops.reduce((s, h) => s + h.km * h.n, 0)
  const legs = hops.reduce((s, h) => s + h.n, 0)
  const name = (p: [number, number]) => ports.find((x) => Math.abs(x.p[0] - p[0]) < 0.1 && Math.abs(x.p[1] - p[1]) < 0.1)?.name || 'somewhere'
  const byN = [...hops].sort((a, b) => b.n - a.n || b.km - a.km)
  const longest = [...hops].sort((a, b) => b.km - a.km)[0]
  // One airport at a time: its routes and the airports they reach. Busiest first; the pick resets with the range.
  const named = ports.filter((p) => p.name)
  const [pick, setPick] = useState(0)
  useEffect(() => setPick(0), [data])
  const from = named[Math.min(pick, Math.max(0, named.length - 1))]
  const near = (a: [number, number], b: [number, number]) => Math.abs(a[0] - b[0]) < 0.1 && Math.abs(a[1] - b[1]) < 0.1
  const fromHops = useMemo(() => (from ? hops.filter((h) => near(h.s, from.p) || near(h.t, from.p)) : []), [hops, from])
  const fromPorts = useMemo(() => ports.filter((p) => fromHops.some((h) => near(h.s, p.p) || near(h.t, p.p))), [ports, fromHops])
  const dests = fromHops.map((h) => ({ name: name(near(h.s, from!.p) ? h.t : h.s), n: h.n, km: h.km })).sort((a, b) => b.n - a.n || b.km - a.km)
  if (!hops.length) return <main className="bills"><Bill share={false}><h2 className="word">No flights</h2><p className="lede">Nothing over 80 km in the air on record.</p></Bill></main>
  return (
    <main className="bills">
      <Bill tone="ink" className="hero">
        <div className="two globe-row">
          <div>
            <h1 className="title"><span className="misreg">Up</span><span className="misreg red">There</span></h1>
            <p className="lede sub"><CountUp value={legs} /> flights on {hops.length} routes. <CountUp value={km} /> km above the ground; the longest {longest ? `${n0(longest.km)} km, ${name(longest.s)} to ${name(longest.t)}` : ''}.</p>
          </div>
          <FlightMap hops={hops} ports={ports} mode="globe" className="big" />
        </div>
        <div className="foot"><span>{ports.length} airports · {hops.length} routes</span><span><CountUp value={Math.round(km / 1.609)} /> mi</span></div>
      </Bill>

      {from && (
        <Bill>
          <div className="two globe-row">
            <div>
              <h2 className="word">From</h2>
              <div className="filters">
                <select value={pick} onChange={(e) => setPick(+e.target.value)} aria-label="Airport">
                  {named.map((p, i) => <option key={p.name + p.p.join()} value={i}>{p.name} · {p.n} {p.n === 1 ? 'leg' : 'legs'}</option>)}
                </select>
              </div>
              <ol className="dates" aria-label={`Routes from ${from.name}`}>
                {dests.slice(0, 8).map((d) => (
                  <li key={d.name}>
                    <span className="where">{d.name}<small>{n0(d.km)} km</small></span>
                    <span className="n">{d.n}<small>{d.n === 1 ? 'flight' : 'flights'}</small></span>
                  </li>
                ))}
                {dests.length > 8 && <li className="more">+ {dests.length - 8} more</li>}
              </ol>
            </div>
            <FlightMap key={from.name} hops={fromHops} ports={fromPorts} height={520} />
          </div>
          <div className="foot"><span>{from.name} · {fromHops.reduce((s, h) => s + h.n, 0)} flights · {fromHops.length} routes</span><span>{n0(fromHops.reduce((s, h) => s + h.km * h.n, 0))} km</span></div>
        </Bill>
      )}

      <Bill>
        <div className="two">
          <div>
            <h2 className="word">Routes</h2>
            <ol className="dates" aria-label="Most flown routes">
              {byN.slice(0, 10).map((h) => (
                <li key={`${h.s}${h.t}`}>
                  <span className="where">{name(h.s)} ↔ {name(h.t)}<small>{n0(h.km)} km</small></span>
                  <span className="n">{h.n}<small>{h.n === 1 ? 'flight' : 'flights'}</small></span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h2 className="word">Airports</h2>
            <ol className="dates" aria-label="Busiest airports">
              {ports.slice(0, 10).map((p) => (
                <li key={p.name + p.p.join()}>
                  <span className="where">{p.name || 'Somewhere'}</span>
                  <span className="n">{p.n}<small>{p.n === 1 ? 'leg' : 'legs'}</small></span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="foot"><span>{ports.length} airports · {hops.length} routes</span><span><CountUp value={km} /> km</span></div>
      </Bill>
    </main>
  )
}
