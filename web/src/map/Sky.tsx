import { useData } from '../data/DataContext'
import { useStore, useThrottledPlayhead } from '../store/useStore'

/** Day/night over the map: blue-ink at night, a breath of ember at dawn and dusk. Two opacity layers, so it composites. */
export function Sky() {
  const data = useData()
  const playhead = useThrottledPlayhead(400) ?? data.meta.range[0]
  const playing = useStore((s) => s.playing)
  const tz = data.visits.find((v) => v.start <= playhead && playhead <= v.end)?.tz
    ?? data.activities.find((a) => a.start <= playhead && playhead <= a.end)?.tz ?? 0
  const h = (((playhead + tz * 60) / 3600) % 24 + 24) % 24
  const night = playing ? Math.max(0, Math.min(1, (Math.cos(((h - 1) / 24) * 2 * Math.PI) - 0.2) / 0.8)) : 0
  const ember = playing ? Math.max(0, 1 - Math.abs(h - 6.5) / 1.5) + Math.max(0, 1 - Math.abs(h - 18.5) / 1.5) : 0
  return (
    <div className="sky" aria-hidden>
      <div className="night" style={{ opacity: night * 0.3 }} />
      <div className="ember" style={{ opacity: ember * 0.07 }} />
    </div>
  )
}
