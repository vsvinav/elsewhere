import type { Data, Place } from './types'
import { inRange } from '../analytics/range'

/** Cut the record to [a, b]; place counts are recomputed from the visits that remain. */
export function filterData(d: Data, range: [number, number]): Data {
  const [a, b] = range
  const visits = inRange(d.visits, range)
  const dayA = new Date(a * 1000).toISOString().slice(0, 10), dayB = new Date(b * 1000).toISOString().slice(0, 10)
  const places: Record<string, Place> = {}
  for (const v of visits) {
    const src = d.places[v.place_id]
    if (!src) continue
    const p = places[v.place_id] ?? (places[v.place_id] = { ...src, n_visits: 0, total_hours: 0, first_ts: v.start, last_ts: v.end })
    p.n_visits++; p.total_hours += (v.end - v.start) / 3600
    p.first_ts = Math.min(p.first_ts, v.start); p.last_ts = Math.max(p.last_ts, v.end)
  }
  return {
    ...d, visits, places,
    activities: inRange(d.activities, range), strokes: inRange(d.strokes, range), paths: inRange(d.paths, range),
    trips: inRange(d.trips, range), daily: d.daily.filter((x) => x.date >= dayA && x.date <= dayB),
    meta: { ...d.meta, range: [Math.max(a, d.meta.range[0]), Math.min(b, d.meta.range[1])] },
  }
}
