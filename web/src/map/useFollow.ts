import { useEffect, useRef } from 'react'
import { useMap } from '@vis.gl/react-google-maps'
import { useData } from '../data/DataContext'
import { useStore } from '../store/useStore'
import { distanceKm, positionAt } from '../analytics/position'
import { fitZoom, step, zoomForKmh, type Spring } from './camera'

const LOOKAHEAD_REAL_S = 1.5
const POS_PERIOD_S = 1.4
const ZOOM_PERIOD_S = 3
const MAX_ZOOM = 16

/**
 * Follow camera: springs toward a point between where you are and where you will be in a few seconds,
 * zoomed for how fast you are moving and never tighter than what frames that look-ahead.
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
    const onWheel = () => { userZoom.current = true }
    const userZoom = { current: false }
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
      const aheadT = now + (s.playing ? LOOKAHEAD_REAL_S * s.speed : 0)
      const ahead = positionAt(data, aheadT) ?? here
      const kmh = s.playing ? distanceKm(here, ahead) / (LOOKAHEAD_REAL_S * s.speed / 3600) : 0
      const div = map.getDiv()
      const zTarget = Math.min(MAX_ZOOM, zoomForKmh(kmh), fitZoom(here, ahead, div.clientWidth, div.clientHeight)) + zoomOffset.current
      const tLng = (here.lng + ahead.lng) / 2, tLat = (here.lat + ahead.lat) / 2

      if (!spr.current) {
        const c = map.getCenter()
        spr.current = { lng: { x: c?.lng() ?? tLng, v: 0 }, lat: { x: c?.lat() ?? tLat, v: 0 }, zoom: { x: map.getZoom() ?? zTarget, v: 0 } }
      }
      const sp = spr.current
      // A jump (flight, gap in the record) is a cut, not a pan: zoom out through the spring, do not race across the globe.
      const jumpKm = distanceKm({ lng: sp.lng.x, lat: sp.lat.x }, { lng: tLng, lat: tLat })
      const period = jumpKm > 300 ? POS_PERIOD_S * 2.2 : POS_PERIOD_S
      step(sp.lng, tLng, dt, period); step(sp.lat, tLat, dt, period)
      step(sp.zoom, jumpKm > 300 ? Math.min(zTarget, fitZoom({ lng: sp.lng.x, lat: sp.lat.x }, here, div.clientWidth, div.clientHeight)) : zTarget, dt, ZOOM_PERIOD_S)

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
