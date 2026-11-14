import type { Data } from '../data/types'
import { isHome } from './geo'

export interface MonthKm { key: string; total: number; byMode: Record<string, number> }
export type DayType = 'away' | 'work' | 'out' | 'home'
export interface CityRow { city: string; country: string | null; visits: number; places: number; hours: number; first: number; last: number }
export interface Stats {
  months: MonthKm[]
  /** hours away from home, [weekday 0=Mon..6][hour 0..23], in the visit's local time */
  rhythm: number[][]
  rhythmMax: number
  dayTypes: Record<DayType, number>
  cities: CityRow[]
}

export function dayType(d: Data['daily'][number]): DayType {
  if (d.max_dist_from_home_km > 100) return 'away'
  if (d.hours_work >= 2) return 'work'
  if (d.hours_other >= 3) return 'out'
  return 'home'
}

export function stats(data: Data): Stats {
  const byMonth = new Map<string, MonthKm>()
  const dayTypes: Record<DayType, number> = { away: 0, work: 0, out: 0, home: 0 }
  for (const d of data.daily) {
    const key = d.date.slice(0, 7)
    let m = byMonth.get(key)
    if (!m) { m = { key, total: 0, byMode: {} }; byMonth.set(key, m) }
    for (const [mode, km] of Object.entries(d.km_by_mode)) { m.byMode[mode] = (m.byMode[mode] ?? 0) + km; m.total += km }
    dayTypes[dayType(d)]++
  }

  const rhythm = Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
  let rhythmMax = 0
  for (const v of data.visits) {
    if (v.lvl !== 0 || isHome(v.type)) continue
    // walk the visit hour by hour in local time, crediting each cell with the fraction covered
    for (let t = v.start; t < v.end; ) {
      const local = new Date((t + v.tz * 60) * 1000)
      const hourEnd = t + 3600 - ((t + v.tz * 60) % 3600)
      const frac = (Math.min(v.end, hourEnd) - t) / 3600
      const cell = rhythm[(local.getUTCDay() + 6) % 7]
      cell[local.getUTCHours()] += frac
      rhythmMax = Math.max(rhythmMax, cell[local.getUTCHours()])
      t = hourEnd
    }
  }

  const cities = new Map<string, CityRow & { ids: Set<string> }>()
  for (const v of data.visits) {
    if (v.lvl !== 0) continue
    const p = data.places[v.place_id]
    if (!p?.city) continue
    let c = cities.get(p.city)
    if (!c) { c = { city: p.city, country: p.country_code, visits: 0, places: 0, hours: 0, first: v.start, last: v.end, ids: new Set() }; cities.set(p.city, c) }
    c.visits++; c.hours += (v.end - v.start) / 3600; c.ids.add(v.place_id)
    c.first = Math.min(c.first, v.start); c.last = Math.max(c.last, v.end)
  }

  return {
    months: [...byMonth.values()].sort((a, b) => a.key.localeCompare(b.key)),
    rhythm, rhythmMax, dayTypes,
    cities: [...cities.values()].map(({ ids, ...c }) => ({ ...c, places: ids.size })).sort((a, b) => b.hours - a.hours),
  }
}
