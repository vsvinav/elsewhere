import { useEffect, useRef } from 'react'
import { useMap } from '@vis.gl/react-google-maps'
import { useData } from '../data/DataContext'
import { useStore } from '../store/useStore'
import { positionAt, segmentAt } from '../analytics/position'
import { fitZoom, step, type Spring } from './camera'

const POS_PERIOD_S = 2.4
const ZOOM_PERIOD_S = 4.5
const STAY_ZOOM = 14
const MAX_ZOOM = 15.5
const MIN_ZOOM = 3

/**
 * Follow camera: centre springs to where you are; zoom springs to frame the whole current leg
 * (so a flight shows the arc, a walk shows the street), settling to a town view on stays.
 * Dragging detaches; wheel zoom becomes an offset that is kept.
 */
export function useFollow() {
  const map = useMap()
  const data = useData()
  const spr = useRef<{ lng: Spring; lat: Spring; zoom: Spring } | null>(null)
  const zoomOffset = useRef(0)
  const lastTarget = useRef(0)

  useEffect(() => {
    if (!map) return
    const detach = map.addListener('dragstart', () => useStore.getState().setFollow(false))
    const userZoom = { current: false }
    const onWheel = () => { userZoom.current = true }
    const idle = map.addListener('idle', () => {
      if (userZoom.current && spr.current) {
        const z = map.getZoom() ?? spr.current.zoom.x
        zoomOffset.current += z - spr.current.zoom.x
        spr.current.zoom.x = z; spr.current.zoom.v = 0
        userZoom.current = false
      }
    })
    const div = map.getDiv()
    div.addEventListener('wheel', onWheel, { passive: true })
    return () => { detach.remove(); idle.remove(); div.removeEventListener('wheel', onWheel) }
  }, [map])

  useEffect(() => {
    if (!map) return
    let raf = 0, last = performance.now()
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const t = performance.now(), dt = Math.min(0.25, (t - last) / 1000); last = t
      const s = useStore.getState()
      if (!s.follow) { spr.current = null; return }
      const now = s.playhead ?? data.meta.range[0]
      const here = positionAt(data, now)
      if (!here) return
      const seg = segmentAt(data, now)
      const div = map.getDiv()
      // Faster replay: a quicker camera and a wider frame, so the subject stays on screen instead of being chased.
      const fast = Math.max(1, s.speed)
      const quick = 1 / Math.sqrt(fast)
      const legZoom = seg.kind === 'visit' || !s.playing ? STAY_ZOOM : fitZoom(seg.s, seg.e, div.clientWidth * 0.7, div.clientHeight * 0.7)
      const zTarget = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, legZoom - Math.log2(fast) * 0.8)) + zoomOffset.current

      if (!spr.current) {
        const c = map.getCenter()
        spr.current = { lng: { x: c?.lng() ?? here.lng, v: 0 }, lat: { x: c?.lat() ?? here.lat, v: 0 }, zoom: { x: map.getZoom() ?? zTarget, v: 0 } }
      }
      const sp = spr.current
      step(sp.lng, here.lng, dt, POS_PERIOD_S * quick); step(sp.lat, here.lat, dt, POS_PERIOD_S * quick)
      step(sp.zoom, zTarget, dt, ZOOM_PERIOD_S * quick)

      const moved = Math.abs(sp.lng.v) + Math.abs(sp.lat.v) > 1e-7 || Math.abs(sp.zoom.v) > 1e-4
      if (moved || t - lastTarget.current > 500) {
        lastTarget.current = t
        map.moveCamera({ center: { lat: sp.lat.x, lng: sp.lng.x }, zoom: sp.zoom.x })
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [map, data])
}
