import { useData } from '../data/DataContext'
import { useStore, type Speed } from '../store/useStore'
import { fmtDate } from '../analytics/format'

const SPEEDS: Speed[] = [1, 10, 100]

export function Scrubber() {
  const { meta } = useData()
  const [m0, m1] = meta.range
  const [r0, r1] = useStore((s) => s.timeRange)
  const playhead = useStore((s) => s.playhead)
  const playing = useStore((s) => s.playing)
  const speed = useStore((s) => s.speed)
  const { setTimeRange, setPlayhead, setPlaying, setSpeed, setFollow } = useStore.getState()
  const pos = playhead ?? r0
  const pct = (t: number) => ((t - m0) / (m1 - m0)) * 100

  return (
    <div className="card scrubber">
      <button className="play" onClick={() => { if (!playing && (playhead == null || playhead >= r1)) setPlayhead(r0); if (!playing) setFollow(true); setPlaying(!playing) }}>
        {playing ? '❚❚' : '▶'}
      </button>
      <div className="speeds">
        {SPEEDS.map((s) => (
          <button key={s} className={s === speed ? 'on' : ''} onClick={() => setSpeed(s)}>{s}×</button>
        ))}
      </div>
      <div className="track">
        <div className="range-fill" style={{ left: `${pct(r0)}%`, width: `${pct(r1) - pct(r0)}%` }} />
        <div className="head" style={{ left: `${pct(pos)}%` }} />
        <input type="range" min={m0} max={m1} value={r0} step={3600}
          onChange={(e) => { const v = Math.min(+e.target.value, r1 - 86400); setTimeRange([v, r1]); if (pos < v) setPlayhead(v) }} />
        <input type="range" min={m0} max={m1} value={r1} step={3600}
          onChange={(e) => { const v = Math.max(+e.target.value, r0 + 86400); setTimeRange([r0, v]); if (pos > v) setPlayhead(v) }} />
        <input type="range" className="headinput" min={r0} max={r1} value={pos} step={600}
          onChange={(e) => { setPlaying(false); setPlayhead(+e.target.value) }} />
      </div>
      <div className="labels">
        <span>{fmtDate(r0)}</span>
        <span>{fmtDate(r1)}</span>
      </div>
    </div>
  )
}
