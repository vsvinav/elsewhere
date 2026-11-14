import type { Data, Visit } from '../data/types'
import { isHome } from './geo'
import { distanceKm } from './position'

export type NightKind = 'home' | 'new' | 'repeat' | 'none'
export interface Night { date: string; kind: NightKind; city: string | null }

const NIGHT_HOUR = 3
const HOME_RADIUS_KM = 30

const dayKey = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10)

/** Each local 03:00 instant inside a stay, with the local date it belongs to. */
function nightsOf(v: Pick<Visit, 'start' | 'end' | 'tz'>): string[] {
  const off = v.tz * 60
  let t = Math.ceil((v.start + off - NIGHT_HOUR * 3600) / 86400) * 86400 + NIGHT_HOUR * 3600 - off
  const out: string[] = []
  for (; t <= v.end; t += 86400) out.push(dayKey(t + off))
  return out
}

/**
 * One entry per local night in `range`: where the visitor slept, and whether that city was
 * new to them at the time. Firsts are judged over the whole record, so a January trip stays
 * "new" when the range is cut to January.
 */
export function bedStrip(data: Data, range: [number, number] = data.meta.range): Night[] {
  const home = data.profile.home
  const slept = new Map<string, { kind: NightKind; city: string | null }>()
  const seenCity = new Set<string>()
  for (const v of data.visits) {
    if (v.lvl !== 0) continue
    const p = data.places[v.place_id]
    const atHome = isHome(p) || distanceKm(home, v) < HOME_RADIUS_KM
    const city = p?.city ?? null
    const key = city ?? v.place_id
    // Judged once per stay, so every night of a first visit reads as new.
    const kind: NightKind = atHome ? 'home' : seenCity.has(key) ? 'repeat' : 'new'
    const nights = nightsOf(v)
    if (!atHome && nights.length) seenCity.add(key)
    for (const d of nights) if (!slept.has(d)) slept.set(d, { kind, city })
  }
  const out: Night[] = []
  const a = dayKey(range[0]), b = dayKey(range[1])
  for (let t = Date.parse(a + 'T00:00:00Z'); dayKey(t / 1000) <= b; t += 86400_000) {
    const d = dayKey(t / 1000)
    const s = slept.get(d)
    out.push({ date: d, kind: s?.kind ?? 'none', city: s?.city ?? null })
  }
  return out
}

/** Longest unbroken run of nights matching `pred`, with its dates. */
export function longestRun(nights: Night[], pred: (n: Night) => boolean): { from: string; to: string; n: number } | null {
  let best: { from: string; to: string; n: number } | null = null
  let cur: { from: string; to: string; n: number } | null = null
  for (const night of nights) {
    if (pred(night)) {
      cur = cur ? { from: cur.from, to: night.date, n: cur.n + 1 } : { from: night.date, to: night.date, n: 1 }
      if (!best || cur.n > best.n) best = cur
    } else cur = null
  }
  return best
}
