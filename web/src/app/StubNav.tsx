import { useEffect, useState } from 'react'
import { TABS, useStore } from '../store/useStore'
import { anyLive, useCrew } from '../crew/friends'
import { TAB_LABEL as LABEL } from './tabs'

export const LIVE_LABEL = 'Someone is live'
const TICK_MS = 60_000

/** True while a friend's fix is fresh; re-checked each minute so the dot goes out on its own. */
function useLive(): boolean {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), TICK_MS); return () => clearInterval(id) }, [])
  return useCrew((s) => anyLive(s.fixes, now))
}

export function StubNav() {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const live = useLive()
  return (
    <nav className="ticket" aria-label="Sections">
      <button className="brand" onClick={() => { setTab('home'); scrollTo({ top: 0, behavior: 'smooth' }) }} aria-label="Back to the tour">else<i>where</i></button>
      {TABS.map((t) => (
        <button key={t} onClick={() => setTab(t)} aria-current={t === tab ? 'page' : undefined}>
          {t === 'crew' && live ? <span className="lbl">{LABEL[t]}<span className="live" role="img" aria-label={LIVE_LABEL} /></span> : LABEL[t]}
        </button>
      ))}
    </nav>
  )
}
