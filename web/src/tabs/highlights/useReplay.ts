import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A scoped replay: the playhead sweeps `range` in `ms` of wall time on requestAnimationFrame,
 * then parks at the end. Local to the caller; the store's playhead is untouched.
 */
export function useReplay(range: [number, number], ms = 10_000) {
  const [playhead, setPlayhead] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const raf = useRef(0)
  const stop = useCallback(() => { if (raf.current) cancelAnimationFrame(raf.current); raf.current = 0; setPlaying(false) }, [])
  const play = useCallback(() => {
    stop()
    const [r0, r1] = range
    let t0 = -1
    const tick = (t: number) => {
      if (t0 < 0) t0 = t
      const f = Math.min(1, (t - t0) / ms)
      setPlayhead(r0 + (r1 - r0) * f)
      if (f < 1) raf.current = requestAnimationFrame(tick)
      else { raf.current = 0; setPlaying(false) }
    }
    setPlayhead(r0)
    setPlaying(true)
    raf.current = requestAnimationFrame(tick)
  }, [range, ms, stop])
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current) }, [])
  return { playhead, playing, play, stop }
}
