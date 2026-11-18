import { useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'

/** Pointer above the strip scrubs finer: 1 inside, ÷4.5 per strip-height above, never finer than ÷20. */
export function fineness(y: number, height: number): number {
  if (y >= 0) return 1
  return Math.max(1 / 20, 1 / 4.5 ** (-y / height))
}

export function scrubDelta(o: { from: number; dx: number; y: number; width: number; height: number; range: [number, number] }): number {
  const perPx = (o.range[1] - o.range[0]) / Math.max(1, o.width)
  const t = o.from + o.dx * perPx * fineness(o.y, o.height)
  return Math.min(o.range[1], Math.max(o.range[0], t))
}

const LINGER_MS = 600

/** Attaches drag-to-scrub to an element: down pauses, move sets the playhead, up clears `scrubbing` after a moment. */
export function useScrub(ref: React.RefObject<HTMLElement | null>, range: [number, number]) {
  const last = useRef<{ id: number; x: number; t: number } | null>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    let linger = 0
    const rect = () => el.getBoundingClientRect()
    const stop = () => {
      if (last.current && el.hasPointerCapture?.(last.current.id)) el.releasePointerCapture(last.current.id)
      last.current = null
      window.clearTimeout(linger)
      useStore.getState().setScrubbing(false)
    }
    const down = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return
      // A second finger is a pinch, not a scrub.
      if (last.current && last.current.id !== e.pointerId) { stop(); return }
      el.setPointerCapture(e.pointerId)
      const r = rect(); const s = useStore.getState()
      const t = scrubDelta({ from: range[0], dx: e.clientX - r.left, y: 0, width: r.width, height: r.height, range })
      window.clearTimeout(linger)
      s.setPlaying(false); s.setScrubbing(true); s.setPlayhead(t)
      last.current = { id: e.pointerId, x: e.clientX, t }
    }
    const move = (e: PointerEvent) => {
      if (!last.current || last.current.id !== e.pointerId) return
      const r = rect()
      const t = scrubDelta({ from: last.current.t, dx: e.clientX - last.current.x, y: e.clientY - r.top, width: r.width, height: r.height, range })
      useStore.getState().setPlayhead(t)
      last.current = { id: e.pointerId, x: e.clientX, t }
    }
    const up = (e: PointerEvent) => {
      if (!last.current || last.current.id !== e.pointerId) return
      last.current = null
      linger = window.setTimeout(() => useStore.getState().setScrubbing(false), LINGER_MS)
    }
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up)
    return () => {
      stop()
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up)
    }
  }, [ref, range[0], range[1]])
}

const PINCH_IN = 0.8
const PINCH_OUT = 1.25

/** Which way a pinch has committed: 1 once the fingers spread past 1.25×, -1 once they close under 0.8×, else 0. */
export function pinchStep(startDist: number, dist: number): 1 | -1 | 0 {
  const ratio = dist / Math.max(1, startDist)
  return ratio > PINCH_OUT ? 1 : ratio < PINCH_IN ? -1 : 0
}

/** Two fingers on the element step `onStep` once per gesture: spread = 1, close = -1. */
export function usePinch(ref: React.RefObject<HTMLElement | null>, onStep: (dir: 1 | -1) => void) {
  const cb = useRef(onStep); cb.current = onStep
  useEffect(() => {
    const el = ref.current; if (!el) return
    const pts = new Map<number, { x: number; y: number }>()
    let start = 0, fired = false
    const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y) }
    const down = (e: PointerEvent) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 2) start = dist()
    }
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size !== 2 || fired) return
      const step = pinchStep(start, dist())
      if (step) { fired = true; cb.current(step) }
    }
    const up = (e: PointerEvent) => { pts.delete(e.pointerId); if (!pts.size) fired = false }
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up)
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up) }
  }, [ref])
}
