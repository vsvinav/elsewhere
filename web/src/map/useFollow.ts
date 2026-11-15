import { useEffect, useRef } from 'react'
import type { Cam } from './cam'
import { useData } from '../data/DataContext'
import { useStore } from '../store/useStore'
import { positionAt, segmentAt } from '../analytics/position'
import { approachZoom, calmFor, dwellZoom, fitZoom, step, zoomCapFor, type Spring } from './camera'
import { upcomingBig } from './lookahead'
import { BIG_KM } from './pace'
import { frameFor } from './frame'

const POS_PERIOD_S = 1.8
const ZOOM_PERIOD_S = 2.6
const MIN_ZOOM = 3
// Real seconds before a big leg at which the camera starts opening up for it.
const LEAD_REAL_S = 2.5
// Real seconds of recent positions that decide how far in the camera may settle while you linger in one area.
const DWELL_REAL_S = 6

/**
 * Follow camera: centre springs to where you are; zoom springs to frame the whole current leg
 * (so a flight shows the arc, a walk shows the street), settling to a town view on stays.
 * Dragging detaches; wheel zoom becomes an offset that is kept.
 */
export function useFollow(map: Cam | null) {
  const data = useData()
  const spr = useRef<{ lng: Spring; lat: Spring; zoom: Spring } | null>(null)
  const zoomOffset = useRef(0)
  const lastTarget = useRef(0)
  const zWant = useRef<number | null>(null)
  const recent = useRef<{ t: number; lng: number; lat: number }[]>([])

  useEffect(() => {
    if (!map) return
    const detach = map.on('dragstart', () => useStore.getState().setFollow(false))
    const userZoom = { current: false }
    const onWheel = () => { userZoom.current = true }
    const idle = map.on('idle', () => {
      if (userZoom.current && spr.current) {
        const z = map.zoom()
        zoomOffset.current += z - spr.current.zoom.x
        spr.current.zoom.x = z; spr.current.zoom.v = 0
        userZoom.current = false
      }
    })
    const div = map.div
    div.addEventListener('wheel', onWheel, { passive: true })
    return () => { detach(); idle(); div.removeEventListener('wheel', onWheel) }
  }, [map])

  useEffect(() => {
    if (!map) return
    let raf = 0, last = performance.now()
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const t = performance.now(), dt = Math.min(0.25, (t - last) / 1000); last = t
      const s = useStore.getState()
      if (!s.follow) { spr.current = null; zWant.current = null; recent.current = []; return }
      const now = s.playhead ?? data.meta.range[0]
      const here = positionAt(data, now)
      if (!here) return
      const seg = segmentAt(data, now)
      const next = segmentAt(data, seg.end + 2)
      const div = map.div
      const f = frameFor(seg, next.start > seg.start ? next : null, here, now, s.rate, div.clientWidth, div.clientHeight)
      // Faster replay: a calmer camera and a lower zoom ceiling, so the subject is framed rather than chased.
      // The zoom target itself pulls out at once but pushes in slowly, so a brief stop never dives into town.
      const calm = calmFor(s.rate)
      // Linger in one area and the ceiling lifts to frame just that area, so a week in town at high speed still gets its close-up.
      const rc = recent.current
      rc.push({ t, lng: here.lng, lat: here.lat })
      while (rc.length && rc[0].t < t - DWELL_REAL_S * 1000) rc.shift()
      const settled = t - rc[0].t > 2000 ? dwellZoom(rc, div.clientWidth, div.clientHeight) : MIN_ZOOM
      const cap = Math.max(zoomCapFor(s.rate), Math.min(settled, zoomCapFor(s.rate) + 5))
      let want = Math.min(cap, Math.max(MIN_ZOOM, f.zoom)), center = f.center
      // Look ahead a few real seconds: a flight or long drive coming up opens the frame now, so it never cuts in abruptly.
      const big = seg.kind === 'activity' && seg.km >= BIG_KM ? null : upcomingBig(data, now, now + s.rate * LEAD_REAL_S)
      if (big) {
        const k = Math.min(1, Math.max(0, 1 - (big.start - now) / (s.rate * LEAD_REAL_S))) ** 0.7
        const bigZoom = Math.max(MIN_ZOOM, fitZoom(big.s, big.e, div.clientWidth * 0.72, div.clientHeight * 0.72))
        want = Math.min(want, want + (bigZoom - want) * k)
        const mid = { lng: (big.s.lng + big.e.lng) / 2, lat: (big.s.lat + big.e.lat) / 2 }
        center = { lng: center.lng + (mid.lng - center.lng) * 0.3 * k, lat: center.lat + (mid.lat - center.lat) * 0.3 * k }
      }
      zWant.current = approachZoom(zWant.current ?? want, want, dt, s.rate)
      const zTarget = zWant.current + zoomOffset.current

      if (!spr.current) {
        const c = map.center()
        spr.current = { lng: { x: c.lng, v: 0 }, lat: { x: c.lat, v: 0 }, zoom: { x: map.zoom(), v: 0 } }
      }
      const sp = spr.current
      const posCalm = Math.sqrt(calm)
      step(sp.lng, center.lng, dt, POS_PERIOD_S * posCalm); step(sp.lat, center.lat, dt, POS_PERIOD_S * posCalm)
      step(sp.zoom, zTarget, dt, ZOOM_PERIOD_S * calm)

      const moved = Math.abs(sp.lng.v) + Math.abs(sp.lat.v) > 1e-7 || Math.abs(sp.zoom.v) > 1e-4
      if (moved || t - lastTarget.current > 500) {
        lastTarget.current = t
        map.move({ lat: sp.lat.x, lng: sp.lng.x }, sp.zoom.x)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [map, data])
}
