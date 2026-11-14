import { TABS, useStore, type Tab } from '../store/useStore'

const LABEL: Record<Tab, string> = { home: 'HOME', stats: 'STATS', places: 'PLACES', trips: 'TRIPS', map: 'MAP', play: 'PLAY' }

export function StubNav() {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  return (
    <nav className="stubnav" aria-label="Sections">
      {TABS.map((t) => (
        <button key={t} onClick={() => setTab(t)} aria-current={t === tab ? 'page' : undefined}>{LABEL[t]}</button>
      ))}
      <div className="brand">elsewhere</div>
    </nav>
  )
}
