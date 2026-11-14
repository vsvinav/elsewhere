import { useMemo } from 'react'
import type { Data } from '../data/types'

const W = 1100, H = 118, MAX_PTS = 15000

/** The real GPS record printed as hairlines; flights as dashed orange. */
export function TrailMap({ data, height = H }: { data: Data; height?: number }) {
  const { lines, flights } = useMemo(() => {
    const total = data.paths.reduce((s, p) => s + p.pts.length, 0)
    const step = Math.max(1, Math.ceil(total / MAX_PTS))
    const raw = data.paths.map((p) => p.pts.filter((_, i) => i % step === 0).map(([, lat, lng]) => [lng, lat] as [number, number])).filter((l) => l.length > 1)
    const fl = data.activities.filter((a) => a.mode === 'FLYING').map((a) => [[a.s_lng, a.s_lat], [a.e_lng, a.e_lat]] as [number, number][])
    const all = raw.flat()
    if (!all.length) return { lines: [], flights: [] }
    // Fit the frame to where the record is dense (5th–95th percentile) so flights do not shrink daily life to a dot.
    const q = (vals: number[], p: number) => vals.sort((a, b) => a - b)[Math.floor(p * (vals.length - 1))]
    const midLat = q(all.map((p) => p[1]), 0.5)
    const k = Math.cos((midLat * Math.PI) / 180)
    const xs = all.map((p) => p[0] * k), ys = all.map((p) => p[1])
    const x0 = q(xs, 0.05), x1 = q(xs, 0.95), y0 = q(ys, 0.05), y1 = q(ys, 0.95)
    const pad = 6
    const s = Math.min((W - 2 * pad) / Math.max(1e-6, x1 - x0), (height - 2 * pad) / Math.max(1e-6, y1 - y0))
    const ox = (W - (x1 - x0) * s) / 2, oy = (height - (y1 - y0) * s) / 2
    const proj = ([lng, lat]: [number, number]) => `${(lng * k - x0) * s + ox},${(y1 - lat) * s + oy}`
    return {
      lines: raw.map((l) => l.map(proj).join(' ')),
      flights: fl.map((l) => l.map(proj).join(' ')),
    }
  }, [data, height])
  return (
    <div className="trail" style={{ height }} aria-hidden>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" fill="none" style={{ overflow: 'hidden' }}>
        {lines.map((d, i) => <polyline key={i} points={d} stroke="var(--ink)" strokeWidth={0.7} strokeOpacity={0.85} />)}
        {flights.map((d, i) => <polyline key={`f${i}`} points={d} stroke="var(--orange)" strokeWidth={1.2} strokeDasharray="3 4" />)}
      </svg>
    </div>
  )
}
