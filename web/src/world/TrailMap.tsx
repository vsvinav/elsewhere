import { useEffect, useMemo, useState } from 'react'
import type { Data } from '../data/types'
import type { Stop } from '../analytics/tour'
import { loadLand } from './land'

const W = 1100, H = 300, MAX_PTS = 9000

type P = [number, number]
/**
 * The record printed as a poster map: cream continents with an ink coast, roads as runs of red dots,
 * flights as black arcs lifted off the sheet, and the cities you slept in named.
 */
export function TrailMap({ data, stops = [], height = H, className = '' }: { data: Data; stops?: Stop[]; height?: number; className?: string }) {
  const [land, setLand] = useState<GeoJSON.FeatureCollection | null>(null)
  useEffect(() => { loadLand().then(setLand) }, [])
  const { lines, flights, pins, landPath } = useMemo(() => {
    const paths = data.strokes
    const total = paths.reduce((s, p) => s + p.pts.length, 0)
    const step = Math.max(1, Math.ceil(total / MAX_PTS))
    const raw = paths.map((p) => p.pts.filter((_, i) => i % step === 0).map(([, lat, lng]) => [lng, lat] as P)).filter((l) => l.length > 1)
    const fl = data.activities.filter((a) => a.mode === 'FLYING' && a.m > 80_000).map((a) => [[a.s_lng, a.s_lat], [a.e_lng, a.e_lat]] as [P, P])
    const all = [...raw.flat(), ...fl.flat()]
    if (!all.length) return { lines: [], flights: [], pins: [], landPath: '' }
    // Fit the whole record with a little air; flights pull the frame wide, which is the point of the poster.
    const q = (vals: number[], p: number) => vals.sort((a, b) => a - b)[Math.floor(p * (vals.length - 1))]
    const midLat = q(all.map((p) => p[1]), 0.5)
    const k = Math.cos((midLat * Math.PI) / 180)
    const xs = all.map((p) => p[0] * k), ys = all.map((p) => p[1])
    const x0 = q(xs, 0.01), x1 = q(xs, 0.99), y0 = q(ys, 0.01), y1 = q(ys, 0.99)
    const pad = 36
    const s = Math.min((W - 2 * pad) / Math.max(1e-6, x1 - x0), (height - 2 * pad) / Math.max(1e-6, y1 - y0))
    const ox = (W - (x1 - x0) * s) / 2, oy = (height - (y1 - y0) * s) / 2
    const proj = ([lng, lat]: P): P => [(lng * k - x0) * s + ox, (y1 - lat) * s + oy]
    const f1 = (v: number) => v.toFixed(1)
    const arc = ([a, b]: [P, P]) => {
      const [ax, ay] = proj(a), [bx, by] = proj(b)
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy)
      // Control point lifts the arc toward the top of the sheet, like a route drawn by hand.
      const cx = (ax + bx) / 2 - (dy / len) * len * 0.22 * Math.sign(dx || 1), cy = (ay + by) / 2 - Math.abs(dx / len) * len * 0.22
      return `M${f1(ax)},${f1(ay)} Q${f1(cx)},${f1(cy)} ${f1(bx)},${f1(by)}`
    }
    const ring = (r: GeoJSON.Position[]) => r.map(([lng, lat], i) => { const [x, y] = proj([lng, lat]); return `${i ? 'L' : 'M'}${f1(x)},${f1(y)}` }).join('') + 'Z'
    let lp = ''
    if (land) for (const f of land.features) {
      const g = f.geometry
      if (g.type === 'Polygon') lp += g.coordinates.map(ring).join('')
      else if (g.type === 'MultiPolygon') for (const poly of g.coordinates) lp += poly.map(ring).join('')
    }
    return {
      lines: raw.map((l) => l.map((p) => proj(p).map(f1).join(',')).join(' ')),
      flights: fl.map(arc),
      // Cities that would print on top of one another keep only the one with more nights.
      pins: stops.slice(0, 9).map((st) => ({ ...st, xy: proj([st.lng, st.lat]) })).filter((p, i, a) => !a.slice(0, i).some((q) => Math.abs(q.xy[0] - p.xy[0]) < 120 && Math.abs(q.xy[1] - p.xy[1]) < 18)).slice(0, 7),
      landPath: lp,
    }
  }, [data, height, stops, land])
  return (
    <div className={`halftone ${className}`} aria-hidden>
      <svg viewBox={`0 0 ${W} ${height}`} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path className="land" d={landPath} fillRule="evenodd" />
        <g stroke="var(--red)" strokeWidth={3.5} strokeDasharray="0 7">
          {lines.map((d, i) => <polyline key={i} points={d} />)}
        </g>
        <g className="flights" stroke="var(--ink)" strokeWidth={1.6} strokeDasharray="5 6">
          {flights.map((d, i) => <path key={`f${i}`} d={d} />)}
        </g>
        <g className="pins">
          {pins.map((p, i) => (
            <g key={p.city} transform={`translate(${p.xy[0].toFixed(1)},${p.xy[1].toFixed(1)})`}>
              <circle r={i === 0 ? 7 : 5} fill="var(--red)" stroke="var(--stock)" strokeWidth={2.5} />
              <text x={11} y={4}>{p.city.toUpperCase()}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}
