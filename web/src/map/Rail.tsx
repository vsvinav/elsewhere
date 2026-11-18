import type { Rail as Figures } from '../analytics/timeline'

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

/** The "so far" column that prints at the edge of the map while a finger is on the strip. */
export function Rail({ rail, visible, noHome = false }: { rail: Figures; visible: boolean; noHome?: boolean }) {
  const rows: [string, string][] = [
    ['KM SO FAR', fmt(rail.km)],
    ['CITIES', fmt(rail.cities)],
    ['NIGHTS AWAY', noHome ? '—' : fmt(rail.nightsAway)],
    ['FLIGHTS', fmt(rail.flights)],
  ]
  return (
    <aside className={visible ? 'rail' : 'rail hidden'} aria-label="So far" aria-hidden={!visible}>
      {rows.map(([k, v]) => <div key={k} className="rail-row"><span className="rail-k">{k}</span><span className="rail-v">{v}</span></div>)}
      {rail.milestone && <div className="rail-mile" role="status">{rail.milestone}</div>}
    </aside>
  )
}
