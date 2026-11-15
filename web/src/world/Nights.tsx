import { useMemo } from 'react'
import { useRawData } from '../data/DataContext'
import { bedStrip } from '../analytics/beds'
import { bedText } from '../share/text'
import { Bill, CountUp } from './index'
import { Beds } from './figures/Figures'
import { Door } from './Door'

const yearOf = (ts: number) => new Date(ts * 1000).getUTCFullYear()
const mon = (ts: number) => new Date(ts * 1000).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' })

/** Every night in the range as one cell: the shareable signature of a record. */
export function Nights({ range, name }: { range: [number, number]; name?: string | null }) {
  const raw = useRawData()
  const nights = useMemo(() => bedStrip(raw, range), [raw, range])
  const away = nights.filter((n) => n.kind === 'new' || n.kind === 'repeat')
  const fresh = nights.filter((n) => n.kind === 'new').length
  const cities = new Set(away.map((n) => n.city).filter(Boolean)).size
  const known = nights.filter((n) => n.kind !== 'none').length
  const span = yearOf(range[0]) === yearOf(range[1]) ? String(yearOf(range[0])) : `${mon(range[0])} – ${mon(range[1])}`
  const title = `${name ? `${name.toUpperCase()}'S ` : ''}ELSEWHERE ${span.toUpperCase()}`
  if (!known) return null
  return (
    <Bill className="nights" text={() => bedText(nights, title)}>
      <div className="two">
        <div>
          <h2 className="word">Nights</h2>
          <p className="lede">{away.length} of {known} nights somewhere other than home{cities ? `, across ${cities} ${cities === 1 ? 'city' : 'cities'}` : ''}. {fresh ? `${fresh} of them in a city you'd never slept in before.` : 'None of them anywhere new.'}</p>
        </div>
        <div className="num"><Door target={{ kind: 'range', from: range[0], to: range[1], label: `${away.length} nights away` }}><CountUp value={away.length} /><small>away</small></Door></div>
      </div>
      <Beds nights={nights} className="tall" />
      <div className="legend"><span className="ink">Home</span><span className="orange">Somewhere new</span><span className="mustard">Been before</span><span className="ghost">No record</span></div>
      <div className="foot"><span>{span}</span><span>Text → to share the strip</span></div>
    </Bill>
  )
}
