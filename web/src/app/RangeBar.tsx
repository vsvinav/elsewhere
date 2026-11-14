import { useRawData } from '../data/DataContext'
import { useStore } from '../store/useStore'

const DAY = 86400

function isoDay(ts: number) { return new Date(ts * 1000).toISOString().slice(0, 10) }
function fromIso(s: string) { return Math.floor(new Date(s + 'T00:00:00Z').getTime() / 1000) }

/** Date filter shared by every tab: year chips, a trailing-90-days chip, or two dates. */
export function RangeBar() {
  const { meta } = useRawData()
  const range = useStore((s) => s.range)
  const setRange = useStore((s) => s.setRange)
  const [r0, r1] = meta.range
  const years: number[] = []
  for (let y = new Date(r0 * 1000).getUTCFullYear(); y <= new Date(r1 * 1000).getUTCFullYear(); y++) years.push(y)
  const yearRange = (y: number): [number, number] => [fromIso(`${y}-01-01`), fromIso(`${y}-12-31`) + DAY - 1]
  const same = (r: [number, number]) => range !== null && range[0] === r[0] && range[1] === r[1]
  const last90: [number, number] = [r1 - 90 * DAY, r1]
  const lo = range ? range[0] : r0, hi = range ? range[1] : r1
  const set = (a: number, b: number) => setRange(a <= r0 && b >= r1 ? null : [Math.max(r0, a), Math.min(r1, b)])
  return (
    <div className="rangebar" role="group" aria-label="Date range">
      <button aria-pressed={range === null} onClick={() => setRange(null)}>All</button>
      {years.map((y) => <button key={y} aria-pressed={same(yearRange(y))} onClick={() => setRange(yearRange(y))}>{y}</button>)}
      <button aria-pressed={same(last90)} onClick={() => setRange(last90)}>Last 90d</button>
      <label><span>From</span><input type="date" value={isoDay(lo)} min={isoDay(r0)} max={isoDay(hi)} onChange={(e) => e.target.value && set(fromIso(e.target.value), hi)} /></label>
      <label><span>To</span><input type="date" value={isoDay(hi)} min={isoDay(lo)} max={isoDay(r1)} onChange={(e) => e.target.value && set(lo, fromIso(e.target.value) + DAY - 1)} /></label>
    </div>
  )
}
