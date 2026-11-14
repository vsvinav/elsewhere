import type { LngLat } from '../analytics/position'

export interface Spring { x: number; v: number }

/** Critically damped spring step toward target; period is the ~settle time in seconds. */
export function step(s: Spring, target: number, dt: number, period: number): void {
  const w = (2 * Math.PI) / period
  // fixed substeps keep the integration stable and frame-rate independent
  for (let left = dt; left > 0; left -= 0.016) {
    const h = Math.min(0.016, left)
    const a = -2 * w * s.v - w * w * (s.x - target)
    s.v += a * h
    s.x += s.v * h
  }
}

/** Zoom that frames how fast you are moving (km/h), not the label Google gave the leg. */
export function zoomForKmh(kmh: number): number {
  if (kmh > 400) return 5
  if (kmh > 120) return 9
  if (kmh > 50) return 11.5
  if (kmh > 18) return 13
  if (kmh > 4) return 14.5
  return 15.5
}

/** Highest zoom at which both points fit inside `frac` of a viewport of the given pixel size. */
export function fitZoom(a: LngLat, b: LngLat, width: number, height: number, frac = 0.55): number {
  const k = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180))
  // Mercator: a degree of longitude is a fixed pixel width; a degree of latitude stretches by 1/cos(lat)
  const dxDeg = Math.abs(a.lng - b.lng), dyDeg = Math.abs(a.lat - b.lat) / Math.max(0.2, k)
  const zx = Math.log2((360 * width * frac) / Math.max(1e-9, dxDeg * 256))
  const zy = Math.log2((180 * height * frac) / Math.max(1e-9, dyDeg * 256))
  return Math.min(21, zx, zy)
}
