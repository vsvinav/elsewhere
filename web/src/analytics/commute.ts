import type { Data } from '../data/types'
import { inRange } from './range'
import { isHome, isWork } from './geo'

export type Direction = 'to_work' | 'to_home'
export interface Leg {
  direction: Direction
  start: number; end: number; tz: number
  minutes: number
  modes: string[]
  path: [number, number][]
}
export interface LegStats {
  n: number; median_min: number; p90_min: number
  by_weekday: number[]            // Mon..Sun counts
  by_hour: number[]               // 0..23 departure counts
  by_mode: Record<string, number> // legs that used this mode
}
export interface CommuteStats { legs: Leg[]; to_work: LegStats; to_home: LegStats; median_all: number }

const MAX_COMMUTE_SECONDS = 3 * 3600

function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]
}

function stats(legs: Leg[]): LegStats {
  const mins = legs.map((l) => l.minutes)
  const by_weekday = new Array(7).fill(0), by_hour = new Array(24).fill(0), by_mode: Record<string, number> = {}
  for (const l of legs) {
    const d = new Date((l.start + l.tz * 60) * 1000)
    by_weekday[(d.getUTCDay() + 6) % 7]++
    by_hour[d.getUTCHours()]++
    for (const m of new Set(l.modes)) by_mode[m] = (by_mode[m] ?? 0) + 1
  }
  return { n: legs.length, median_min: quantile(mins, 0.5), p90_min: quantile(mins, 0.9), by_weekday, by_hour, by_mode }
}

/** Home↔work legs: consecutive top-level visits home→work or work→home with the activities between them. */
export function commuteStats(data: Data, range: [number, number]): CommuteStats {
  const visits = inRange(data.visits, range).filter((v) => v.lvl === 0)
  const acts = data.activities
  const legs: Leg[] = []
  let ai = 0
  for (let i = 1; i < visits.length; i++) {
    const a = visits[i - 1], b = visits[i]
    const dir: Direction | null = isHome(a.type) && isWork(b.type) ? 'to_work' : isWork(a.type) && isHome(b.type) ? 'to_home' : null
    if (!dir) continue
    const gap = b.start - a.end
    if (gap <= 0 || gap > MAX_COMMUTE_SECONDS) continue
    while (ai < acts.length && acts[ai].start < a.end) ai++
    const modes: string[] = []
    for (let j = ai; j < acts.length && acts[j].start < b.start; j++) modes.push(acts[j].mode)
    // Prefer recorded GPS points between the two visits; fall back to activity endpoints.
    const path: [number, number][] = [[a.lng, a.lat]]
    for (const pth of data.strokes) {
      if (pth.end < a.end || pth.start > b.start) continue
      for (const [ts, lat, lng] of pth.pts) if (ts >= a.end && ts <= b.start) path.push([lng, lat])
    }
    if (path.length === 1) for (let j = ai; j < acts.length && acts[j].start < b.start; j++) path.push([acts[j].s_lng, acts[j].s_lat], [acts[j].e_lng, acts[j].e_lat])
    path.push([b.lng, b.lat])
    legs.push({ direction: dir, start: a.end, end: b.start, tz: b.tz, minutes: gap / 60, modes, path })
  }
  const tw = legs.filter((l) => l.direction === 'to_work'), th = legs.filter((l) => l.direction === 'to_home')
  return { legs, to_work: stats(tw), to_home: stats(th), median_all: quantile(legs.map((l) => l.minutes), 0.5) }
}
