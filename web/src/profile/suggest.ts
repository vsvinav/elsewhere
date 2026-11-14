import type { Data } from '../data/types'
import { haversineKm, ROLE_RADIUS_KM } from '../ingest/derive'

export interface Suggestion {
  place_id: string; lat: number; lng: number; city: string | null; cc: string | null; score: number; last: number
  /** Every Google place id folded into this one. */
  members: string[]
  /** Nights here over all nights slept anywhere in the months this place was slept at, 0–1. Sleep places only. */
  share: number
}

const SLEEP_H = 3
const monthOf = (day: number) => new Date(day * 86400000).toISOString().slice(0, 7)
/** Local-day index → the visit covers 03:00 local that day. */
function* sleptNights(v: { start: number; end: number; tz: number }): Generator<number> {
  const off = v.tz * 60
  const d0 = Math.floor((v.start + off) / 86400), d1 = Math.floor((v.end + off) / 86400)
  for (let day = d0; day <= d1; day++) { const t3 = day * 86400 + SLEEP_H * 3600 - off; if (t3 >= v.start && t3 < v.end) yield day }
}

/** Google often gives one address several place ids; fold each into the busiest within 300 m. */
function fold(list: Suggestion[]): Suggestion[] {
  const out: Suggestion[] = []
  for (const s of list) {
    const hit = out.find((o) => haversineKm(o.lat, o.lng, s.lat, s.lng) <= ROLE_RADIUS_KM)
    if (hit) { hit.score += s.score; hit.last = Math.max(hit.last, s.last); hit.members.push(...s.members) } else out.push({ ...s, members: [...s.members] })
  }
  return out
}

/** Places ranked by nights slept (the lvl-0 visit covering 03:00 local). */
export function sleepPlaces(d: Data, max = 6): Suggestion[] {
  const by = new Map<string, Suggestion>()
  const nights = new Map<string, Map<string, number>>() // place → month → nights
  const total = new Map<string, number>() // month → nights anywhere
  for (const v of d.visits) {
    if (v.lvl !== 0) continue
    const p = d.places[v.place_id]; if (!p) continue
    let n = 0
    for (const day of sleptNights(v)) {
      n++
      const m = monthOf(day), pm = nights.get(v.place_id) ?? new Map<string, number>()
      pm.set(m, (pm.get(m) ?? 0) + 1); nights.set(v.place_id, pm); total.set(m, (total.get(m) ?? 0) + 1)
    }
    if (!n) continue
    const s = by.get(v.place_id) ?? { place_id: v.place_id, lat: p.lat, lng: p.lng, city: p.city, cc: p.country_code, score: 0, last: 0, members: [v.place_id], share: 0 }
    s.score += n; s.last = Math.max(s.last, v.end); by.set(v.place_id, s)
  }
  const out = fold([...by.values()].sort((a, b) => b.score - a.score || b.last - a.last)).sort((a, b) => b.score - a.score || b.last - a.last).slice(0, max)
  for (const s of out) {
    const months = new Set(s.members.flatMap((id) => [...(nights.get(id)?.keys() ?? [])]))
    const all = [...months].reduce((n, m) => n + (total.get(m) ?? 0), 0)
    s.share = all ? s.score / all : 0
  }
  return out
}

/** Weekday 09:00–17:00 local hours per place, excluding sleep places. */
export function weekdayPlaces(d: Data, max = 4): Suggestion[] {
  const sleep = new Set(sleepPlaces(d, 50).map((s) => s.place_id))
  const by = new Map<string, Suggestion>()
  for (const v of d.visits) {
    if (v.lvl !== 0 || sleep.has(v.place_id)) continue
    const p = d.places[v.place_id]; if (!p) continue
    const local = new Date((v.start + v.tz * 60) * 1000), dow = local.getUTCDay(), h = local.getUTCHours()
    if (dow === 0 || dow === 6 || h < 7 || h > 17) continue
    const s = by.get(v.place_id) ?? { place_id: v.place_id, lat: p.lat, lng: p.lng, city: p.city, cc: p.country_code, score: 0, last: 0, members: [v.place_id], share: 0 }
    s.score += (v.end - v.start) / 3600; s.last = Math.max(s.last, v.end); by.set(v.place_id, s)
  }
  return fold([...by.values()].sort((a, b) => b.score - a.score)).sort((a, b) => b.score - a.score).slice(0, max)
}

/** Months where the most-slept place changes from the previous month (≥10 nights at the new one). */
export function moveMonths(d: Data): { month: string; from: string; to: string }[] {
  const perMonth = new Map<string, Map<string, number>>()
  for (const v of d.visits) {
    if (v.lvl !== 0) continue
    for (const day of sleptNights(v)) {
      const m = monthOf(day)
      const b = perMonth.get(m) ?? new Map<string, number>(); b.set(v.place_id, (b.get(v.place_id) ?? 0) + 1); perMonth.set(m, b)
    }
  }
  const months = [...perMonth.keys()].sort()
  const modal = (m: string) => [...perMonth.get(m)!.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const out: { month: string; from: string; to: string }[] = []
  for (let i = 1; i < months.length; i++) {
    const a = modal(months[i - 1]), b = modal(months[i])
    if (a !== b && perMonth.get(months[i])!.get(b)! >= 10 && !out.some((o) => o.to === b)) out.push({ month: months[i], from: a, to: b })
  }
  return out
}
