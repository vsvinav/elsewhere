import { useRawData } from '../data/DataContext'
import { useStore } from '../store/useStore'
import { DatePick, DAY } from './DatePick'
import { yearSpan, yearsOf } from './yearWheel'

const midnight = (ts: number) => ts - (ts % DAY)

/** Date filter shared by every tab: year chips, a trailing-90-days chip, or two dates. */
export function RangeBar() {
  const { meta } = useRawData()
  const range = useStore((s) => s.range)
  const setRange = useStore((s) => s.setRange)
  const [r0, r1] = meta.range
  const years = yearsOf(meta.range)
  const yearRange = (y: number) => yearSpan(meta.range, y)
  const same = (r: [number, number]) => range !== null && range[0] === r[0] && range[1] === r[1]
  const last90: [number, number] = [r1 - 90 * DAY, r1]
  const lo = range ? range[0] : r0, hi = range ? range[1] : r1
  const set = (a: number, b: number) => setRange(a <= r0 && b >= r1 ? null : [Math.max(r0, a), Math.min(r1, b)])
  return (
    <div className="rangebar" role="group" aria-label="Date range">
      <button aria-pressed={range === null} onClick={() => setRange(null)}>All</button>
      {years.map((y) => <button key={y} aria-pressed={same(yearRange(y))} onClick={() => setRange(yearRange(y))}>{y}</button>)}
      <button aria-pressed={same(last90)} onClick={() => setRange(last90)}>Last 90d</button>
      <DatePick label="From" value={midnight(lo)} min={midnight(r0)} max={midnight(hi)} other={midnight(hi)} onChange={(d) => set(d, hi)} />
      <DatePick label="To" value={midnight(hi)} min={midnight(lo)} max={midnight(r1)} other={midnight(lo)} onChange={(d) => set(lo, d + DAY - 1)} />
    </div>
  )
}
