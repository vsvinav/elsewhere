import { useMemo } from 'react'
import { useData } from '../../data/DataContext'
import { flights } from '../../world/flights'
import { FlightMap } from '../../world/FlightMap'
import { CountUp } from '../../world'
import { n0 } from '../../world/fmt'

/** Every route flown, raised off a full-bleed relief; the figures sit in an ink stub like the replay HUD. */
export function Flights() {
  const data = useData()
  const { hops, ports } = useMemo(() => flights(data), [data])
  const km = hops.reduce((s, h) => s + h.km * h.n, 0)
  const legs = hops.reduce((s, h) => s + h.n, 0)
  const longest = [...hops].sort((a, b) => b.km - a.km)[0]
  // Ports are bucketed to 0.1°, so match by cell, not by exact coordinate.
  const name = (p: [number, number]) => ports.find((x) => Math.abs(x.p[0] - p[0]) < 0.1 && Math.abs(x.p[1] - p[1]) < 0.1)?.name || 'somewhere'
  return (
    <div className="screen">
      <FlightMap data={data} fill />
      <div className="hud hud-flights">
        <div className="hud-stub">
          <div className="hud-date"><span className="dow">Air legs</span><span className="day"><CountUp value={legs} /></span><span className="mon">flights</span><span className="time">{hops.length} routes · {ports.length} airports</span></div>
          <div className="hud-where">
            <div className="lab">Kilometres flown</div>
            <div className="val"><CountUp value={km} /> km</div>
            <div className="sub">{longest ? `Longest hop ${n0(longest.km)} km · ${name(longest.s)} ↔ ${name(longest.t)}` : 'No flights on record'}</div>
          </div>
          <div className="hud-where">
            <div className="lab">Most used</div>
            <div className="val">{ports[0]?.name || '—'}</div>
            <div className="sub">{ports[0] ? `${ports[0].n} departures and arrivals` : ''}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
