import { TABS, useStore, type Tab } from '../store/useStore'

const LABEL: Record<Tab, string> = { home: 'Tour', stats: 'Numbers', facts: 'Facts', places: 'Stops', trips: 'Dates', flights: 'Flights', map: 'Map', play: 'Replay' }

export function StubNav() {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  return (
    <nav className="ticket" aria-label="Sections">
      <div className="brand">else<i>where</i></div>
      {TABS.map((t) => (
        <button key={t} onClick={() => setTab(t)} aria-current={t === tab ? 'page' : undefined}>{LABEL[t]}</button>
      ))}
    </nav>
  )
}
