import type { Data } from '../data/types'
import { isHome, isWork } from './geo'

export type PlaceStatus = 'new' | 'repeat' | 'lapsed'
export interface Bucket { key: string; start: number; end: number; new: number; repeat: number; lapsed: number }

const LAPSE_SECONDS = 90 * 86400
const LAPSE_MIN_VISITS = 3

function monthStart(ts: number): number {
  const d = new Date(ts * 1000)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000
}
function nextMonth(ts: number): number {
  const d = new Date(ts * 1000)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000
}

function nonRoutine(data: Data) {
  return data.visits.filter((v) => v.lvl === 0 && !isHome(v.type) && !isWork(v.type))
}

/**
 * Month-by-month exploration: places seen for the first time, places revisited, and places
 * (≥3 lifetime visits) that crossed the 90-day-unvisited threshold during the month.
 */
export function explorationScore(data: Data, range: [number, number]): Bucket[] {
  const visits = nonRoutine(data)
  const out: Bucket[] = []
  for (let s = monthStart(range[0]); s <= range[1]; s = nextMonth(s)) {
    const e = Math.min(nextMonth(s), range[1] + 1)
    const seen = new Set<string>()
    let nu = 0, rep = 0
    for (const v of visits) {
      if (v.start < s || v.start >= e || seen.has(v.place_id)) continue
      seen.add(v.place_id)
      const p = data.places[v.place_id]
      if (p && p.first_ts >= s) nu++; else rep++
    }
    let lapsed = 0
    for (const p of Object.values(data.places)) {
      if (p.n_visits < LAPSE_MIN_VISITS || p.semantic_type.includes('HOME') || p.semantic_type.includes('WORK')) continue
      const crossed = p.last_ts + LAPSE_SECONDS
      if (crossed >= s && crossed < e) lapsed++
    }
    out.push({ key: new Date(s * 1000).toISOString().slice(0, 7), start: s, end: e - 1, new: nu, repeat: rep, lapsed })
  }
  return out
}

/** Status of every non-routine place visited in range, for the map. */
export function placeStatuses(data: Data, range: [number, number]): { place_id: string; lng: number; lat: number; status: PlaceStatus; n: number }[] {
  const seen = new Map<string, number>()
  for (const v of nonRoutine(data)) {
    if (v.start < range[0] || v.start > range[1]) continue
    seen.set(v.place_id, (seen.get(v.place_id) ?? 0) + 1)
  }
  const out: ReturnType<typeof placeStatuses> = []
  for (const [place_id, n] of seen) {
    const p = data.places[place_id]
    if (!p) continue
    const status: PlaceStatus = p.first_ts >= range[0] ? 'new' : 'repeat'
    out.push({ place_id, lng: p.lng, lat: p.lat, status, n })
  }
  for (const [place_id, p] of Object.entries(data.places)) {
    if (seen.has(place_id) || p.n_visits < LAPSE_MIN_VISITS) continue
    if (p.semantic_type.includes('HOME') || p.semantic_type.includes('WORK')) continue
    if (p.last_ts < range[1] - LAPSE_SECONDS && p.last_ts >= range[0] - 365 * 86400) out.push({ place_id, lng: p.lng, lat: p.lat, status: 'lapsed', n: p.n_visits })
  }
  return out
}
