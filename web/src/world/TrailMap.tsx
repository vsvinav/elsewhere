import { useMemo } from 'react'
import type { Data } from '../data/types'

const W = 1100, H = 118, MAX_PTS = 15000

/** The real GPS record printed as hairlines; flights as dashed orange. */
export function TrailMap({ data, height = H, range, mark }: { data: Data; height?: number; range?: [number, number]; mark?: { lat: number; lng: number } }) {
  const { lines, flights, dot } = useMemo(() => {
    const paths = range ? data.strokes.filter((p) => p.end >= range[0] && p.start <= range[1]) : data.strokes
    const acts = range ? data.activities.filter((a) => a.start >= range[0] && a.start <= range[1]) : data.activities
    const total = paths.reduce((s, p) => s + p.pts.length, 0)
    const step = Math.max(1, Math.ceil(total / MAX_PTS))
    const raw = paths.map((p) => p.pts.filter((_, i) => i % step === 0).map(([, lat, lng]) => [lng, lat] as [number, number])).filter((l) => l.length > 1)
    const fl = acts.filter((a) => a.mode === 'FLYING').map((a) => [[a.s_lng, a.s_lat], [a.e_lng, a.e_lat]] as [number, number][])
    const all = [...raw.flat(), ...(range ? fl.flat() : [])]
    if (!all.length) return { lines: [], flights: [], dot: null }
    // Whole record: fit where it is dense (5th–95th pct) so flights do not shrink daily life to a dot. A range shows everything.
    const lo = range ? 0 : 0.05, hi = range ? 1 : 0.95
    const q = (vals: number[], p: number) => vals.sort((a, b) => a - b)[Math.floor(p * (vals.length - 1))]
    const midLat = mark?.lat ?? q(all.map((p) => p[1]), 0.5)
    const k = Math.cos((midLat * Math.PI) / 180)
    const xs = all.map((p) => p[0] * k), ys = all.map((p) => p[1])
    let x0 = q(xs, lo), x1 = q(xs, hi), y0 = q(ys, lo), y1 = q(ys, hi)
    if (mark) { // frame ~4 km around the marked place
      const r = 0.02; x0 = mark.lng * k - r; x1 = mark.lng * k + r; y0 = mark.lat - r; y1 = mark.lat + r
    }
    const pad = 6
    const s = Math.min((W - 2 * pad) / Math.max(1e-6, x1 - x0), (height - 2 * pad) / Math.max(1e-6, y1 - y0))
    const ox = (W - (x1 - x0) * s) / 2, oy = (height - (y1 - y0) * s) / 2
    const proj = ([lng, lat]: [number, number]) => [(lng * k - x0) * s + ox, (y1 - lat) * s + oy] as [number, number]
    return {
      lines: raw.map((l) => l.map((p) => proj(p).join(',')).join(' ')),
      flights: fl.map((l) => l.map((p) => proj(p).join(',')).join(' ')),
      dot: mark ? proj([mark.lng, mark.lat]) : null,
    }
  }, [data, height, range, mark])
  return (
    <div className="trail" style={{ height }} aria-hidden>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" fill="none" style={{ overflow: 'hidden' }}>
        {lines.map((d, i) => <polyline key={i} points={d} stroke="var(--ink)" strokeWidth={0.7} strokeOpacity={0.85} />)}
        {flights.map((d, i) => <polyline key={`f${i}`} points={d} stroke="var(--orange)" strokeWidth={1.2} strokeDasharray="3 4" />)}
        {dot && <circle cx={dot[0]} cy={dot[1]} r={5} fill="var(--orange)" />}
      </svg>
    </div>
  )
}
