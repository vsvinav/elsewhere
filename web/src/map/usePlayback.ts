import { useEffect } from 'react'
import { useStore } from '../store/useStore'
import { useData } from '../data/DataContext'
import { segmentAt, type Segment } from '../analytics/position'

const GAP_RATE = 6 * 3600

/** Real seconds a segment should take on screen at pace 1: legs 2.5–7 s by distance, stays 0.6–2.5 s by length. */
export function realSeconds(seg: Segment): number {
  if (seg.kind === 'activity') return Math.min(7, Math.max(2.5, 2 + Math.log2(1 + seg.km) * 0.6))
  if (seg.kind === 'visit') return Math.min(2.5, Math.max(0.6, 0.6 + ((seg.end - seg.start) / 3600) * 0.2))
  return (seg.end - seg.start) / GAP_RATE
}

/** Advances the playhead while playing, pacing by segment so every movement is readable and no stay drags. */
export function usePlayback() {
  const data = useData()
  const playing = useStore((s) => s.playing)
  useEffect(() => {
    if (!playing) return
    let raf = 0, last = performance.now(), shown = useStore.getState().rate
    const tick = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000); last = t
      const s = useStore.getState()
      const [r0, r1] = data.meta.range
      const cur = s.playhead ?? r0
      const seg = segmentAt(data, cur)
      const rate = Math.min(48 * 3600, Math.max(60, (seg.end - seg.start) / (realSeconds(seg) / s.speed)))
      const next = Math.min(cur + dt * rate, seg.end + 1)
      if (next >= r1) { s.setPlayhead(r1); s.setPlaying(false); return }
      // The rate the visuals see eases, so trail length does not snap at every segment boundary.
      shown += (rate - shown) * Math.min(1, dt / 0.8)
      s.setRate(shown)
      s.setPlayhead(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, data])
}
