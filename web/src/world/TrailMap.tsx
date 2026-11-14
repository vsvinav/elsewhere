import { useMemo } from 'react'
import type { Data } from '../data/types'

const W = 1100, H = 260, MAX_PTS = 9000

/**
 * The record as a halftone: every stroke a run of red dots on the stock, flights as sparse black dots.
 * `ring` circles one place on the whole record instead of zooming to it, so a single stop reads as a stop, not a tangle.
 */
export function TrailMap({ data, height = H, range, ring, className = '' }: { data: Data; height?: number; range?: [number, number]; ring?: { lat: number; lng: number }; className?: string }) {
  const { lines, flights, mark } = useMemo(() => {
    const paths = range ? data.strokes.filter((p) => p.end >= range[0] && p.start <= range[1]) : data.strokes
    const acts = range ? data.activities.filter((a) => a.start >= range[0] && a.start <= range[1]) : data.activities
    const total = paths.reduce((s, p) => s + p.pts.length, 0)
    const step = Math.max(1, Math.ceil(total / MAX_PTS))
    const raw = paths.map((p) => p.pts.filter((_, i) => i % step === 0).map(([, lat, lng]) => [lng, lat] as [number, number])).filter((l) => l.length > 1)
    const fl = acts.filter((a) => a.mode === 'FLYING').map((a) => [[a.s_lng, a.s_lat], [a.e_lng, a.e_lat]] as [number, number][])
    const all = [...raw.flat(), ...(range ? fl.flat() : [])]
    if (!all.length) return { lines: [], flights: [], mark: null }
    // Whole record: fit where it is dense (5th–95th pct) so flights do not shrink daily life to a dot. A range shows everything.
    const lo = range ? 0 : 0.05, hi = range ? 1 : 0.95
    const q = (vals: number[], p: number) => vals.sort((a, b) => a - b)[Math.floor(p * (vals.length - 1))]
    const midLat = q(all.map((p) => p[1]), 0.5)
    const k = Math.cos((midLat * Math.PI) / 180)
    const xs = all.map((p) => p[0] * k), ys = all.map((p) => p[1])
    const x0 = q(xs, lo), x1 = q(xs, hi), y0 = q(ys, lo), y1 = q(ys, hi)
    const pad = 12
    const s = Math.min((W - 2 * pad) / Math.max(1e-6, x1 - x0), (height - 2 * pad) / Math.max(1e-6, y1 - y0))
    const ox = (W - (x1 - x0) * s) / 2, oy = (height - (y1 - y0) * s) / 2
    const proj = ([lng, lat]: [number, number]) => [(lng * k - x0) * s + ox, (y1 - lat) * s + oy] as [number, number]
    const clamp = ([x, y]: [number, number]): [number, number] => [Math.max(8, Math.min(W - 8, x)), Math.max(8, Math.min(height - 8, y))]
    return {
      lines: raw.map((l) => l.map((p) => proj(p).map((v) => v.toFixed(1)).join(',')).join(' ')),
      flights: fl.map((l) => l.map((p) => proj(p).map((v) => v.toFixed(1)).join(',')).join(' ')),
      mark: ring ? clamp(proj([ring.lng, ring.lat])) : null,
    }
  }, [data, height, range, ring])
  return (
    <div className={`halftone ${className}`} aria-hidden>
      <svg viewBox={`0 0 ${W} ${height}`} fill="none" strokeLinecap="round">
        <g stroke="var(--red)" strokeWidth={4} strokeDasharray="0 8">
          {lines.map((d, i) => <polyline key={i} points={d} />)}
        </g>
        <g stroke="var(--ink)" strokeWidth={3} strokeDasharray="0 16">
          {flights.map((d, i) => <polyline key={`f${i}`} points={d} />)}
        </g>
        {mark && <>
          <circle className="ring" cx={mark[0]} cy={mark[1]} r={26} />
          <circle cx={mark[0]} cy={mark[1]} r={6} fill="var(--red)" />
        </>}
      </svg>
    </div>
  )
}
