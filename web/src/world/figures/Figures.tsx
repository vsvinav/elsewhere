import { useEffect, useState } from 'react'
import type { Figure } from '../../analytics/facts'
import type { Night } from '../../analytics/beds'
import { loadLand } from '../land'
import './figures.css'

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const polar = (cx: number, cy: number, r: number, frac: number) => [cx + r * Math.sin(2 * Math.PI * frac), cy - r * Math.cos(2 * Math.PI * frac)] as const
const n = (x: number) => Math.round(x).toLocaleString('en-US')

/** Share of a whole: a thin ghost ring with the filled arc in red. A floor on the arc so 3% still reads. */
export function Ring({ pct, label }: { pct: number; label: string }) {
  const r = 54, c = 2 * Math.PI * r, p = Math.min(100, Math.max(0, pct))
  const dash = Math.max(c * 0.015, (c * p) / 100)
  return (
    <svg className="fig ring" viewBox="0 0 140 140" role="img" aria-label={`${Math.round(pct)}% ${label}`}>
      <circle className="c-ghost" cx="70" cy="70" r={r} fill="none" stroke="currentColor" strokeWidth="10" />
      <circle className="c-red" cx="70" cy="70" r={r} fill="none" stroke="currentColor" strokeWidth="10" strokeDasharray={`${dash} ${c}`} transform="rotate(-90 70 70)" />
      <text x="70" y="66" textAnchor="middle" className="n">{pct > 0 && pct < 1 ? pct.toFixed(1) : Math.round(pct)}<tspan className="u">%</tspan></text>
      <text x="70" y="86" textAnchor="middle" className="l">{label}</text>
    </svg>
  )
}

/** Two bars on one scale: what you did against something you can picture. */
export function Scale({ value, ref, refLabel, unit, valueLabel = 'You' }: { value: number; ref: number; refLabel: string; unit: string; valueLabel?: string }) {
  const max = Math.max(value, ref)
  const w = (x: number) => `${Math.max(1.5, (100 * x) / max)}%`
  return (
    <div className="fig scale" role="img" aria-label={`${valueLabel}: ${n(value)} ${unit} against ${refLabel}, ${n(ref)} ${unit}`}>
      <div className="row"><span className="lab">{valueLabel}</span><i className="c-red" style={{ width: w(value) }} /><span className="val">{n(value)} {unit}</span></div>
      <div className="row"><span className="lab">{refLabel}</span><i className="c-ink" style={{ width: w(ref) }} /><span className="val">{n(ref)} {unit}</span></div>
    </div>
  )
}

/** 24-hour dial: a tick per hour, its length the share of legs starting then. Night hours in red. */
export function Dial({ hours }: { hours: number[] }) {
  const max = Math.max(1, ...hours), cx = 70, cy = 70
  return (
    <svg className="fig dial" viewBox="0 0 140 140" role="img" aria-label="When your journeys start, by hour">
      <circle className="c-ink" cx={cx} cy={cy} r="52" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {HOURS.map((h) => {
        const v = hours[h] ?? 0, night = h >= 22 || h < 4
        const len = 5 + (36 * v) / max
        const [x1, y1] = polar(cx, cy, 48, h / 24), [x2, y2] = polar(cx, cy, 48 - len, h / 24)
        return <line key={h} x1={x1} y1={y1} x2={x2} y2={y2} className={v ? (night ? 'c-red' : 'c-ink') : 'c-ghost'} stroke="currentColor" strokeWidth={v ? 3.5 : 1.5} />
      })}
      {[0, 6, 12, 18].map((h) => { const [x, y] = polar(cx, cy, 62, h / 24); return <text key={h} x={x} y={y + 3} textAnchor="middle" className="l">{String(h).padStart(2, '0')}</text> })}
    </svg>
  )
}

/** Seven columns, Monday first; the weekend in red. */
export function Week({ cells }: { cells: number[] }) {
  const max = Math.max(1, ...cells)
  const D = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  return (
    <div className="fig week" role="img" aria-label="New places found, by weekday">
      {D.map((d, i) => (
        <div key={i} className="col">
          <i className={i >= 5 ? 'c-red' : 'c-ink'} style={{ height: `${Math.max(3, (100 * (cells[i] ?? 0)) / max)}%` }} />
          <span>{d}</span>
        </div>
      ))}
    </div>
  )
}

/** One cell per night, stacked by week with Monday on top: ink home, red new city, mustard repeat, outline unknown. */
export function Beds({ nights, className = '' }: { nights: Night[]; className?: string }) {
  if (!nights.length) return null
  const pad = (new Date(nights[0].date + 'T00:00:00Z').getUTCDay() + 6) % 7
  const cells = [...Array<Night | null>(pad).fill(null), ...nights]
  const weeks = Math.ceil(cells.length / 7)
  const cls = (x: Night) => (x.kind === 'home' ? 'c-ink' : x.kind === 'new' ? 'c-red' : 'c-mustard')
  const away = nights.filter((x) => x.kind === 'new' || x.kind === 'repeat').length
  return (
    <svg className={`fig beds ${className}`} viewBox={`0 0 ${weeks * 8} 56`} preserveAspectRatio="xMinYMin meet" role="img" aria-label={`${nights.length} nights, ${away} away from home`}>
      {cells.map((x, i) => x && x.kind !== 'none'
        ? <rect key={i} x={Math.floor(i / 7) * 8 + 0.5} y={(i % 7) * 8 + 0.5} width="7" height="7" className={cls(x)} fill="currentColor" />
        : x ? <rect key={i} x={Math.floor(i / 7) * 8 + 1} y={(i % 7) * 8 + 1} width="6" height="6" className="c-ghost" fill="none" stroke="currentColor" strokeWidth="0.6" /> : null)}
    </svg>
  )
}

/** Small orthographic globe facing the midpoint of home and the far point, the arc between them in red. */
export function Globe({ lat, lng, homeLat, homeLng }: { lat: number; lng: number; homeLat: number; homeLng: number }) {
  const [land, setLand] = useState<GeoJSON.FeatureCollection | null>(null)
  useEffect(() => { let on = true; loadLand().then((l) => { if (on) setLand(l) }); return () => { on = false } }, [])
  const R = 64, cx = 70, cy = 70, rad = Math.PI / 180
  const [c0, c1] = interpolate([homeLng, homeLat], [lng, lat], 0.5).map((x) => x * rad)
  const proj = (lo: number, la: number): [number, number, boolean] => {
    const l = lo * rad, p = la * rad
    const vis = Math.sin(c1) * Math.sin(p) + Math.cos(c1) * Math.cos(p) * Math.cos(l - c0) > 0
    return [cx + R * Math.cos(p) * Math.sin(l - c0), cy - R * (Math.cos(c1) * Math.sin(p) - Math.sin(c1) * Math.cos(p) * Math.cos(l - c0)), vis]
  }
  const ring = (coords: number[][]) => {
    let d = '', pen = false
    for (const c of coords) {
      const [x, y, vis] = proj(c[0], c[1])
      if (!vis) { pen = false; continue }
      d += `${pen ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
      pen = true
    }
    return d
  }
  const landPath = land?.features.map((f) => {
    const g = f.geometry
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
    return polys.map((p) => p.map(ring).join('')).join('')
  }).join('') ?? ''
  const arc = Array.from({ length: 33 }, (_, i) => interpolate([homeLng, homeLat], [lng, lat], i / 32))
  const home = proj(homeLng, homeLat), far = proj(lng, lat)
  return (
    <svg className="fig globe" viewBox="0 0 140 140" role="img" aria-label="Furthest point from home, on a globe">
      <circle className="c-ink" cx={cx} cy={cy} r={R} fill="currentColor" />
      <path className="c-stock" d={landPath} fill="none" stroke="currentColor" strokeWidth="0.7" strokeLinejoin="round" opacity="0.85" />
      <path className="c-red" d={ring(arc)} fill="none" stroke="currentColor" strokeWidth="2" />
      <circle className="c-stock" cx={home[0]} cy={home[1]} r="3" fill="currentColor" />
      <circle className="c-red" cx={far[0]} cy={far[1]} r="4" fill="currentColor" stroke="var(--stock)" strokeWidth="1.2" />
    </svg>
  )
}

const toVec = ([lo, la]: [number, number]) => { const r = Math.PI / 180; return [Math.cos(la * r) * Math.cos(lo * r), Math.cos(la * r) * Math.sin(lo * r), Math.sin(la * r)] }
function interpolate(a: [number, number], b: [number, number], t: number): [number, number] {
  const va = toVec(a), vb = toVec(b)
  const [x, y, z] = va.map((v, i) => v * (1 - t) + vb[i] * t)
  const r = 180 / Math.PI
  return [Math.atan2(y, x) * r, Math.atan2(z, Math.hypot(x, y)) * r]
}

export function Fig({ f }: { f: Figure }) {
  switch (f.t) {
    case 'ring': return <Ring pct={f.pct} label={f.label} />
    case 'scale': return <Scale value={f.value} ref={f.ref} refLabel={f.refLabel} unit={f.unit} valueLabel={f.valueLabel} />
    case 'dial': return <Dial hours={f.hours} />
    case 'week': return <Week cells={f.cells} />
    case 'globe': return <Globe lat={f.lat} lng={f.lng} homeLat={f.homeLat} homeLng={f.homeLng} />
    case 'beds': return <Beds nights={f.nights} />
  }
}
