import { useEffect } from 'react'
import { useStore } from '../store/useStore'

/** 1x = one hour of timeline per real second. */
export const SECONDS_PER_REAL_SECOND = 3600

export function usePlayback() {
  const playing = useStore((s) => s.playing)
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (t: number) => {
      const dt = (t - last) / 1000
      last = t
      const s = useStore.getState()
      const [r0, r1] = s.timeRange
      const cur = s.playhead ?? r0
      const next = cur + dt * SECONDS_PER_REAL_SECOND * s.speed
      if (next >= r1) { s.setPlayhead(r1); s.setPlaying(false); return }
      s.setPlayhead(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])
}
