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

/** Replay pace in hours of record per real second, floored at a walking pace of 1 so slow replay is never "fast". */
export const paceOf = (rate: number) => Math.max(1, rate / 3600 / 1.5)

/** How much slower the camera should settle as the replay speeds up: a day a second is ~2.6× calmer than real pace. */
export const calmFor = (rate: number) => 1 + Math.log2(paceOf(rate)) * 0.4

/** Zoom ceiling by pace: street level at a stroll, region at a day a second, continent faster. */
export const zoomCapFor = (rate: number) => Math.max(5, 15.5 - Math.log2(paceOf(rate)) * 2.1)

/**
 * Cinematic zoom target: pull out at once (never lose the subject), but push in no faster than
 * `IN_PER_S` levels per second, slower the faster the replay, so a two-second stop never dives into town.
 */
const IN_PER_S = 1.4
export function approachZoom(cur: number, want: number, dt: number, rate: number): number {
  if (want <= cur) return want
  return Math.min(want, cur + (dt * IN_PER_S) / calmFor(rate))
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

/** Zoom that frames a cloud of recent positions in `frac` of the viewport; 15.5 when they all sit in one spot. */
export function dwellZoom(pts: LngLat[], width: number, height: number): number {
  if (pts.length < 2) return 15.5
  let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity
  for (const p of pts) { if (p.lng < w) w = p.lng; if (p.lng > e) e = p.lng; if (p.lat < s) s = p.lat; if (p.lat > n) n = p.lat }
  return Math.min(15.5, fitZoom({ lng: w, lat: s }, { lng: e, lat: n }, width, height, 0.6))
}
