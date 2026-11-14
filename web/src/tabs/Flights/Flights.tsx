import { useMemo } from 'react'
import { useData } from '../../data/DataContext'
import { flights } from '../../world/flights'
import { regions } from '../../world/regions'
import { FlightMap } from '../../world/FlightMap'
import { Bill, CountUp } from '../../world'
import { n0 } from '../../world/fmt'

/** The air record as a poster page: the earth, then each neighbourhood of airports, then the ledger. */
export function Flights() {
  const data = useData()
  const { hops, ports } = useMemo(() => flights(data), [data])
  const regs = useMemo(() => regions(hops, ports), [hops, ports])
  const km = hops.reduce((s, h) => s + h.km * h.n, 0)
  const legs = hops.reduce((s, h) => s + h.n, 0)
  const name = (p: [number, number]) => ports.find((x) => Math.abs(x.p[0] - p[0]) < 0.1 && Math.abs(x.p[1] - p[1]) < 0.1)?.name || 'somewhere'
  const byN = [...hops].sort((a, b) => b.n - a.n || b.km - a.km)
  const longest = [...hops].sort((a, b) => b.km - a.km)[0]
  if (!hops.length) return <main className="bills"><Bill share={false}><h2 className="word">No flights</h2><p className="lede">Nothing over 80 km in the air on record.</p></Bill></main>
  return (
    <main className="bills">
      <Bill tone="ink" className="hero">
        <div className="two globe-row">
          <div>
            <div className="caps">Air record · {ports.length} airports</div>
            <h1 className="title"><span className="misreg">Up</span><span className="misreg red">There</span></h1>
            <p className="lede sub"><CountUp value={legs} /> flights on {hops.length} routes. <CountUp value={km} /> km above the ground; the longest {longest ? `${n0(longest.km)} km, ${name(longest.s)} to ${name(longest.t)}` : ''}.</p>
          </div>
          <FlightMap hops={hops} ports={ports} mode="globe" className="big" />
        </div>
        <div className="foot"><span>{ports.length} airports · {hops.length} routes</span><span><CountUp value={Math.round(km / 1.609)} /> mi</span></div>
      </Bill>

      {regs.map((r) => (
        <Bill key={r.name}>
          <h2 className="word">{r.name}</h2>
          <div className="caps">{r.hops.reduce((s, h) => s + h.n, 0)} flights · {r.hops.length} routes · {r.ports.map((p) => p.name).filter(Boolean).join(' · ')}</div>
          <FlightMap hops={r.hops} ports={r.ports} height={520} />
        </Bill>
      ))}

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
