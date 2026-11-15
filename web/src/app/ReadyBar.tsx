import { useEffect, useState } from 'react'
import './readybar.css'

/** Where the local work has got to: reading, parsing, deriving, drawing paths. API lookups are not counted here. */
export interface Ready { label: string; pct: number }

const TRIPS = 'Working out trips'
const IMPORT: Record<string, Ready> = { reading: { label: 'Reading file', pct: 10 }, parsing: { label: 'Finding stops', pct: 35 }, cities: { label: 'Finding cities', pct: 60 }, deriving: { label: TRIPS, pct: 85 }, done: { label: TRIPS, pct: 100 } }
const REDERIVE: Record<string, Ready> = { ...IMPORT, deriving: { label: TRIPS, pct: 50 } }

export const readyFor = (stage: string, mode: 'import' | 'rederive'): Ready | null => (mode === 'rederive' ? REDERIVE : IMPORT)[stage] ?? null

/** A thin red line along the top edge that fills as the record is built, then lifts off. */
export function ReadyBar({ ready }: { ready: Ready | null }) {
  const [gone, setGone] = useState(false)
  useEffect(() => {
    if (!ready || ready.pct < 100) { setGone(false); return }
    const t = setTimeout(() => setGone(true), 600)
    return () => clearTimeout(t)
  }, [ready])
  if (!ready || gone) return null
  return (
    <div className="ready" data-done={ready.pct >= 100 || undefined} role="progressbar" aria-label={ready.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={ready.pct}>
      <i style={{ width: `${ready.pct}%` }} />
      <span>{ready.label}</span>
    </div>
  )
}
