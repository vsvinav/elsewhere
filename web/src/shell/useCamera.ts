import { useEffect, useRef } from 'react'
import { useMap } from '@vis.gl/react-google-maps'
import { useData } from '../data/DataContext'
import { useStore } from '../store/useStore'
import { whereaboutsAt, zoomForMode } from '../analytics/position'

const TAU_POS_S = 0.9      // position smoothing time constant
const TAU_ZOOM_S = 2.5     // zoom smoothing time constant
const DEADZONE_FRAC = 0.18 // start re-centring when the dot is this far from centre (fraction of the short side)
const SETTLE_PX = 1.5      // stop moving once this close
const PANEL_PAD = { top: 80, bottom: 120, left: 400, right: 80 }

function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom
}

/**
 * Drives the Google Map camera. Follow mode eases the camera toward the current location with a
 * deadzone (no per-frame snapping); insights can request fitBounds through store.camera.
 */
export function useCamera() {
  const map = useMap()
  const data = useData()
  const cam = useRef<{ lng: number; lat: number; zoom: number } | null>(null)
  const moving = useRef(false)
  const zoomLockMode = useRef<string | null>(null)
  const userZoomed = useRef(false)

  // User gestures: drag detaches follow; wheel/pinch zoom keeps follow but freezes mode-based zoom.
  useEffect(() => {
    if (!map) return
    const l1 = map.addListener('dragstart', () => useStore.getState().setFollow(false))
    const onUserZoom = () => {
      const s = useStore.getState()
      zoomLockMode.current = whereaboutsAt(data, s.playhead ?? s.timeRange[1])?.mode ?? 'STILL'
      userZoomed.current = true
    }
    // After a user zoom gesture, adopt the map's zoom as the camera's.
    const l2 = map.addListener('idle', () => {
      if (userZoomed.current && cam.current) { cam.current.zoom = map.getZoom() ?? cam.current.zoom; userZoomed.current = false }
    })
    const div = map.getDiv()
    div.addEventListener('wheel', onUserZoom, { passive: true })
    div.addEventListener('dblclick', onUserZoom)
    div.addEventListener('touchmove', onUserZoom, { passive: true })
    return () => { l1.remove(); l2.remove(); div.removeEventListener('wheel', onUserZoom); div.removeEventListener('dblclick', onUserZoom); div.removeEventListener('touchmove', onUserZoom) }
  }, [map, data])

  // Insight-driven camera requests.
  const camera = useStore((s) => s.camera)
  useEffect(() => {
    if (!map || !camera) return
    const [[x0, y0], [x1, y1]] = camera.bounds
    if (Math.abs(x1 - x0) < 1e-6 && Math.abs(y1 - y0) < 1e-6) {
      map.panTo({ lat: y0, lng: x0 }); map.setZoom(15)
    } else {
      map.fitBounds(new google.maps.LatLngBounds({ lat: y0, lng: x0 }, { lat: y1, lng: x1 }), PANEL_PAD)
    }
  }, [map, camera])

  // Follow loop.
  useEffect(() => {
    if (!map) return
    let raf = 0, last = performance.now()
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const t = performance.now(), dt = Math.min(0.1, (t - last) / 1000); last = t
      const s = useStore.getState()
      if (!(s.follow && s.activeInsight === 'replay')) { cam.current = null; moving.current = false; return }
      const w = whereaboutsAt(data, s.playhead ?? s.timeRange[1])
      if (!w) return
      if (zoomLockMode.current && zoomLockMode.current !== w.mode) zoomLockMode.current = null

      if (!cam.current) {
        const c = map.getCenter()
        cam.current = { lng: c?.lng() ?? w.lng, lat: c?.lat() ?? w.lat, zoom: map.getZoom() ?? zoomForMode(w.mode) }
      }
      const c = cam.current
      const div = map.getDiv()
      const shortSide = Math.min(div.clientWidth, div.clientHeight)
      const mpp = metersPerPixel(c.lat, c.zoom)
      const dxPx = ((w.lng - c.lng) * 111320 * Math.cos((c.lat * Math.PI) / 180)) / mpp
      const dyPx = ((w.lat - c.lat) * 110540) / mpp
      const distPx = Math.hypot(dxPx, dyPx)

      if (!moving.current && distPx > DEADZONE_FRAC * shortSide * 0.5) moving.current = true
      if (moving.current && distPx < SETTLE_PX) moving.current = false

      const kp = 1 - Math.exp(-dt / TAU_POS_S), kz = 1 - Math.exp(-dt / TAU_ZOOM_S)
      let changed = false
      if (moving.current) {
        c.lng += (w.lng - c.lng) * kp; c.lat += (w.lat - c.lat) * kp; changed = true
      }
      if (userZoomed.current) return
      if (!zoomLockMode.current) {
        const tz = zoomForMode(w.mode)
        if (Math.abs(tz - c.zoom) > 0.002) { c.zoom += (tz - c.zoom) * kz; changed = true }
      }
      if (changed) {
        map.moveCamera({ center: { lat: c.lat, lng: c.lng }, zoom: c.zoom })
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [map, data])
}
