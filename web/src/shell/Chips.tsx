import { COMING_SOON, insights } from '../insights/registry'
import { useStore } from '../store/useStore'

export function Chips() {
  const active = useStore((s) => s.activeInsight)
  const setInsight = useStore((s) => s.setInsight)
  return (
    <div className="chips">
      {insights.map((i) => (
        <button key={i.id} className={`chip ${i.id === active ? 'on' : ''}`} onClick={() => setInsight(i.id)}>{i.label}</button>
      ))}
      {COMING_SOON.map((l) => (
        <button key={l} className="chip soon" disabled title="Coming soon">{l}</button>
      ))}
    </div>
  )
}
