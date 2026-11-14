import { useEffect } from 'react'
import { useStore } from '../store/useStore'
import { useData } from '../data/DataContext'

const SLEEP_MIN_SECONDS = 3 * 3600
const SLEEP_MULT = 6

/** Advances the playhead while playing; long stays at home fast-forward so nights do not drag. */
export function usePlayback() {
  const data = useData()
  const playing = useStore((s) => s.playing)
  useEffect(() => {
    if (!playing) return
    let raf = 0, last = performance.now(), vi = 0
    const tick = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000); last = t
      const s = useStore.getState()
      const [r0, r1] = data.meta.range
      const cur = s.playhead ?? r0
      while (vi < data.visits.length && data.visits[vi].end < cur) vi++
      const v = data.visits[vi]
      const asleep = v && v.lvl === 0 && v.type === 'INFERRED_HOME' && v.start <= cur && v.end - cur > SLEEP_MIN_SECONDS
      const next = cur + dt * s.speed * (asleep ? SLEEP_MULT : 1)
      if (next >= r1) { s.setPlayhead(r1); s.setPlaying(false); return }
      s.setPlayhead(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, data])
}
