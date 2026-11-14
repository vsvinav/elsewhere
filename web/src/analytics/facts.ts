import type { Data, Visit } from '../data/types'
import { bedStrip, longestRun, type Night } from './beds'
import { isHome } from './geo'
import { lensOf } from './lens'
import { distanceKm } from './position'
import { nightsIn } from './tour'
import { flights } from '../world/flights'

export type Kind = 'explored' | 'record' | 'scale' | 'habit'
export type Figure =
  | { t: 'ring'; pct: number; label: string }
  | { t: 'scale'; value: number; ref: number; refLabel: string; unit: string }
  | { t: 'dial'; hours: number[] }
  | { t: 'week'; cells: number[] }
  | { t: 'globe'; lat: number; lng: number; homeLat: number; homeLng: number }
  | { t: 'beds'; nights: Night[] }
export interface Fact { id: string; kind: Kind; headline: string; detail: string; figure?: Figure }
export type Units = 'km' | 'mi'

const EARTH_KM = 40_075, COUNTRIES = 195, MI = 0.621371
const n0 = (x: number) => Math.round(x).toLocaleString('en-US')
const long = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
const longTs = (ts: number) => long(new Date(ts * 1000).toISOString().slice(0, 10))
const localHour = (ts: number, tz: number) => new Date((ts + tz * 60) * 1000).getUTCHours()
const localDow = (ts: number, tz: number) => (new Date((ts + tz * 60) * 1000).getUTCDay() + 6) % 7
const pct = (a: number, b: number) => Math.round((100 * a) / Math.max(1, b))

/** Named walks a reader can picture; km. */
const WALKS: [number, string][] = [
  [42, 'a marathon'], [96, 'the West Highland Way'], [160, 'the length of Long Island'], [280, 'the Jordan Trail'],
  [500, 'the Pennine Way, twice'], [800, 'the Camino de Santiago'], [1_000, 'the Via Francigena from the Alps'],
  [1_400, "Land's End to John o' Groats"], [2_200, 'the length of Britain and back'], [3_500, 'the Appalachian Trail'],
  [4_300, 'the Pacific Crest Trail'], [5_000, 'the Continental Divide Trail'], [6_400, 'the Great Wall of China'],
  [9_000, 'Cape Town to Cairo'], [14_000, 'Patagonia to Alaska'],
]

interface Ctx { d: Data; raw: Data; u: Units; dist: (km: number) => string; cv: (km: number) => number; nights: Night[]; range: [number, number]; isFirst: (v: Visit) => boolean }

const sleeps = (d: Data) => d.visits.filter((v) => v.lvl === 0 && nightsIn(v) > 0)
const kmOf = (d: Data, pred: (mode: string) => boolean) => d.activities.reduce((a, x) => a + (pred(x.mode) ? x.m / 1000 : 0), 0)
const nonRoutine = (d: Data) => d.visits.filter((v) => v.lvl === 0 && d.places[v.place_id]?.role == null)

const GEN: ((c: Ctx) => Fact | null)[] = [
  // 1 · Circumnavigations
  ({ d, dist, cv, u }) => {
    const km = kmOf(d, () => true)
    if (km < 1_000) return null
    const laps = km / EARTH_KM
    return { id: 'laps', kind: 'scale', headline: laps >= 1 ? `${laps.toFixed(1)}× around the Earth` : `${Math.round(laps * 100)}% of the way around the Earth`, detail: `${dist(km)} on record, over ground, rail, water and air. The equator is ${dist(EARTH_KM)}.`, figure: { t: 'scale', value: cv(km), ref: cv(EARTH_KM), refLabel: 'Equator', unit: u } }
  },
  // 2 · Walked equals
  ({ d, dist, cv, u }) => {
    const km = kmOf(d, (m) => lensOf(m) === 'foot')
    if (km < 30) return null
    const [ref, name] = WALKS.reduce((best, w) => (Math.abs(Math.log(w[0] / km)) < Math.abs(Math.log(best[0] / km)) ? w : best))
    const ratio = km / ref
    const how = ratio > 1.15 ? `${ratio.toFixed(1)}× ` : ratio < 0.85 ? `${Math.round(ratio * 100)}% of ` : ''
    return { id: 'walked', kind: 'scale', headline: `Walked ${how}${name}`, detail: `${dist(km)} on foot. ${name[0].toUpperCase() + name.slice(1)} is about ${dist(ref)}.`, figure: { t: 'scale', value: cv(km), ref: cv(ref), refLabel: name.replace(/^the /, ''), unit: u } }
  },
  // 3 · Nights away as hotel floors
  ({ nights }) => {
    const away = nights.filter((n) => n.kind === 'new' || n.kind === 'repeat').length
    if (away < 7) return null
    return { id: 'away', kind: 'scale', headline: `${n0(away)} nights in a bed that wasn't yours`, detail: away >= 30 ? `About ${(away / 30).toFixed(1)} months of the record spent away. Red nights were somewhere new; mustard, somewhere you'd been before.` : `${pct(away, nights.length)}% of the nights in this range. Red nights were somewhere new; mustard, somewhere you'd been before.`, figure: { t: 'beds', nights } }
  },
  // 4 · Longest streak home
  ({ nights }) => {
    const r = longestRun(nights, (n) => n.kind === 'home')
    if (!r || r.n < 14) return null
    return { id: 'streak-home', kind: 'record', headline: `${r.n} nights in your own bed, straight`, detail: `${long(r.from)} to ${long(r.to)}. Your longest stretch without a night away.`, figure: { t: 'beds', nights: nights.filter((n) => n.date >= r.from && n.date <= r.to) } }
  },
  // 5 · Longest streak away
  ({ nights }) => {
    const r = longestRun(nights, (n) => n.kind === 'new' || n.kind === 'repeat')
    if (!r || r.n < 3) return null
    const cities = [...new Set(nights.filter((n) => n.date >= r.from && n.date <= r.to && n.city).map((n) => n.city))]
    return { id: 'streak-away', kind: 'record', headline: `${r.n} nights away without a night home`, detail: `${long(r.from)} to ${long(r.to)}${cities.length ? ` · ${cities.slice(0, 4).join(', ')}${cities.length > 4 ? ` and ${cities.length - 4} more` : ''}` : ''}.`, figure: { t: 'beds', nights: nights.filter((n) => n.date >= r.from && n.date <= r.to) } }
  },
  // 6 · Furthest from home
  ({ d, dist }) => {
    const home = d.profile.home
    let best: Visit | null = null, bestKm = 0
    for (const v of d.visits) { if (v.lvl !== 0) continue; const km = distanceKm(home, v); if (km > bestKm) { bestKm = km; best = v } }
    if (!best || bestKm < 100) return null
    const p = d.places[best.place_id]
    const where = p?.name ?? p?.city ?? 'an unnamed place'
    return { id: 'furthest', kind: 'record', headline: `${dist(bestKm)} from home`, detail: `${where}${p?.city && p.name ? `, ${p.city}` : ''}${p?.country_code ? ` (${p.country_code})` : ''}, ${longTs(best.start)}. The furthest your record gets.`, figure: { t: 'globe', lat: best.lat, lng: best.lng, homeLat: home.lat, homeLng: home.lng } }
  },
  // 7 · Fastest ground leg
  ({ d, u }) => {
    let best = { kmh: 0, mode: '', ts: 0 }
    for (const a of d.activities) {
      if (lensOf(a.mode) === 'fly' || a.end - a.start < 20 * 60 || a.m < 20_000) continue
      const kmh = (a.m / 1000) / ((a.end - a.start) / 3600)
      if (kmh > best.kmh && kmh < 400) best = { kmh, mode: a.mode, ts: a.start }
    }
    if (best.kmh < 60) return null
    const v = u === 'mi' ? best.kmh * MI : best.kmh
    return { id: 'fastest', kind: 'record', headline: `${n0(v)} ${u === 'mi' ? 'mph' : 'km/h'} door to door`, detail: `Your quickest leg over land, ${longTs(best.ts)}, by ${best.mode.replace(/^IN_/, '').replace(/_/g, ' ').toLowerCase()}. Averaged over the whole leg, stops included.` }
  },
  // 8 · Earliest departure from home
  ({ d }) => {
    const hours = Array<number>(24).fill(0)
    let earliest: { h: number; m: number; ts: number } | null = null
    for (let i = 1; i < d.visits.length; i++) {
      const prev = d.visits[i - 1], v = d.visits[i]
      if (!isHome(d.places[prev.place_id]) || isHome(d.places[v.place_id]) || prev.lvl || v.lvl) continue
      const loc = new Date((prev.end + prev.tz * 60) * 1000)
      const h = loc.getUTCHours(), m = loc.getUTCMinutes()
      hours[h]++
      const score = h < 12 ? h * 60 + m : 24 * 60
      if (score >= 3 * 60 && (!earliest || score < earliest.h * 60 + earliest.m)) earliest = { h, m, ts: prev.end }
    }
    if (!earliest || hours.reduce((a, b) => a + b, 0) < 20) return null
    return { id: 'earliest', kind: 'record', headline: `Out the door at ${String(earliest.h).padStart(2, '0')}:${String(earliest.m).padStart(2, '0')}`, detail: `${longTs(earliest.ts)}, your earliest start. The dial shows what hour you usually leave home.`, figure: { t: 'dial', hours } }
  },
  // 9 · Night owl
  ({ d }) => {
    const hours = Array<number>(24).fill(0)
    let late = 0
    for (const a of d.activities) { const h = localHour(a.start, a.tz); hours[h]++; if (h >= 22 || h < 4) late++ }
    const n = d.activities.length
    if (n < 50) return null
    const share = pct(late, n)
    return { id: 'owl', kind: 'habit', headline: share >= 15 ? `Night owl · ${share}% of legs after 10 pm` : `${share}% of your legs start after 10 pm`, detail: `${n0(late)} of ${n0(n)} journeys began between 22:00 and 04:00 local time.`, figure: { t: 'dial', hours } }
  },
  // 10 · Weekend explorer
  ({ d, isFirst }) => {
    const cells = Array<number>(7 * 24).fill(0)
    let firsts = 0, weekend = 0
    for (const v of nonRoutine(d)) {
      if (!isFirst(v)) continue
      firsts++
      const dow = localDow(v.start, v.tz)
      cells[dow * 24 + localHour(v.start, v.tz)]++
      if (dow >= 5) weekend++
    }
    if (firsts < 20) return null
    const share = pct(weekend, firsts)
    return { id: 'weekend', kind: 'habit', headline: `${share}% of new places found on a weekend`, detail: `${n0(firsts)} first visits; ${n0(weekend)} were on a Saturday or Sunday. Two days of seven is ${Math.round(200 / 7)}%.`, figure: { t: 'week', cells } }
  },
  // 11 · New vs repeat
  ({ d, isFirst }) => {
    const vs = nonRoutine(d)
    if (vs.length < 20) return null
    const fresh = vs.filter(isFirst).length
    const share = pct(fresh, vs.length)
    return { id: 'fresh', kind: 'habit', headline: `${share}% of stops were somewhere new`, detail: `${n0(fresh)} first-time places out of ${n0(vs.length)} stops away from home and work.`, figure: { t: 'ring', pct: share, label: 'new' } }
  },
  // 12 · Favourite stop
  ({ d }) => {
    const best = Object.entries(d.places).filter(([, p]) => p.role == null && p.n_visits >= 5).sort((a, b) => b[1].n_visits - a[1].n_visits)[0]
    if (!best) return null
    const [, p] = best
    return { id: 'fav', kind: 'habit', headline: `${p.name ?? 'One unnamed place'} · ${p.n_visits} visits`, detail: `${p.name ? '' : 'Add a Google Maps key to name it. '}Your most visited stop that isn't home or work${p.city ? `, in ${p.city}` : ''}. ${n0(p.total_hours)} hours there in all.` }
  },
  // 13 · Most-flown route
  ({ d, dist }) => {
    const { hops, ports } = flights(d)
    const top = [...hops].sort((a, b) => b.n - a.n || b.km - a.km)[0]
    if (!top || top.n < 2) return null
    const name = (p: [number, number]) => ports.find((x) => Math.abs(x.p[0] - p[0]) < 0.1 && Math.abs(x.p[1] - p[1]) < 0.1)?.name || 'somewhere'
    return { id: 'route', kind: 'record', headline: `${name(top.s)} ↔ ${name(top.t)}, ${top.n} times`, detail: `Your most-flown route, ${dist(top.km)} each way. ${dist(top.km * top.n)} on this one line alone.` }
  },
  // 14 · Countries
  ({ d }) => {
    const cc = new Set<string>()
    for (const p of Object.values(d.places)) if (p.country_code) cc.add(p.country_code)
    if (cc.size < 2) return null
    return { id: 'countries', kind: 'explored', headline: `${cc.size} of ${COUNTRIES} countries`, detail: `${pct(cc.size, COUNTRIES)}% of the world's countries have your footprints in them: ${[...cc].sort().join(', ')}.`, figure: { t: 'ring', pct: (100 * cc.size) / COUNTRIES, label: 'countries' } }
  },
  // 16 · Cities per 1,000 km
  ({ d, dist, cv, u }) => {
    const km = kmOf(d, () => true)
    const cities = new Set<string>()
    for (const v of sleeps(d)) { const c = d.places[v.place_id]?.city; if (c && !isHome(d.places[v.place_id])) cities.add(c) }
    if (km < 2_000 || cities.size < 2) return null
    const per = (1000 * cities.size) / km
    return { id: 'density', kind: 'scale', headline: `A new bed every ${dist(km / cities.size)}`, detail: `${cities.size} cities slept in over ${dist(km)} of travel: ${per.toFixed(1)} cities per 1,000 km.` }
  },
  // 17 · Passed through, never slept
  ({ d }) => {
    const slept = new Set<string>()
    for (const v of sleeps(d)) { const c = d.places[v.place_id]?.city; if (c) slept.add(c) }
    const passed = new Map<string, number>()
    for (const v of d.visits) { const p = d.places[v.place_id]; if (v.lvl === 0 && p?.city && p.role == null && !slept.has(p.city)) passed.set(p.city, (passed.get(p.city) ?? 0) + 1) }
    const top = [...passed.entries()].sort((a, b) => b[1] - a[1])[0]
    if (!top || top[1] < 5) return null
    return { id: 'passed', kind: 'habit', headline: `${top[0]}: ${top[1]} visits, never a night`, detail: `The city you keep passing through without ever sleeping there.` }
  },
  // 18 · New Year's Eve
  ({ d, range }) => {
    const out: string[] = []
    const y0 = new Date(range[0] * 1000).getUTCFullYear(), y1 = new Date(range[1] * 1000).getUTCFullYear()
    for (let y = y0 + 1; y <= y1; y++) {
      const ts = Date.UTC(y, 0, 1) / 1000
      const v = d.visits.find((x) => x.lvl === 0 && x.start - x.tz * 60 <= ts && x.end - x.tz * 60 >= ts)
      if (!v) continue
      const p = d.places[v.place_id]
      out.push(`${y}: ${isHome(p) ? 'home' : p?.name ?? p?.city ?? 'somewhere unnamed'}${!isHome(p) && p?.city && p.name ? `, ${p.city}` : ''}`)
    }
    if (!out.length) return null
    return { id: 'nye', kind: 'habit', headline: out.length === 1 ? `Midnight on New Year's, ${out[0].slice(0, 4)}` : `${out.length} New Year's Eves on record`, detail: out.join(' · ') + '.' }
  },
  // 19 · Busiest travel month
  ({ d, dist, nights }) => {
    const km = new Map<string, number>()
    for (const a of d.activities) { const k = new Date((a.start + a.tz * 60) * 1000).toISOString().slice(0, 7); km.set(k, (km.get(k) ?? 0) + a.m / 1000) }
    const top = [...km.entries()].sort((a, b) => b[1] - a[1])[0]
    if (!top || km.size < 3) return null
    const away = nights.filter((n) => n.date.startsWith(top[0]) && n.kind !== 'home' && n.kind !== 'none').length
    const name = new Date(top[0] + '-01T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' })
    return { id: 'month', kind: 'record', headline: `${name}: ${dist(top[1])}`, detail: `Your busiest month, ${away} nights away. The average month was ${dist([...km.values()].reduce((a, b) => a + b, 0) / km.size)}.`, figure: { t: 'beds', nights: nights.filter((n) => n.date.startsWith(top[0])) } }
  },
  // 20 · Time in motion
  ({ d }) => {
    const h = d.activities.reduce((a, x) => a + (x.end - x.start) / 3600, 0)
    if (h < 48) return null
    const days = h / 24
    return { id: 'motion', kind: 'scale', headline: `${days >= 10 ? n0(days) : days.toFixed(1)} whole days in motion`, detail: `${n0(h)} hours in a vehicle or on foot between places: ${pct(h, (d.meta.range[1] - d.meta.range[0]) / 3600)}% of the record.` }
  },
]

const ORDER: Kind[] = ['explored', 'record', 'scale', 'habit']

/**
 * Every fact the range supports, explored → record → scale → habit. Units from the profile.
 * `data` is the range-filtered record; `raw` the whole one, so firsts are judged over all time.
 */
export function facts(data: Data, units: Units = 'km', raw: Data = data): Fact[] {
  const range = data.meta.range
  const dist = (km: number) => (units === 'mi' ? `${n0(km * MI)} mi` : `${n0(km)} km`)
  const cv = (km: number) => (units === 'mi' ? km * MI : km)
  // First visit ever to a place: the earliest raw visit starts no sooner than this one.
  const isFirst = (v: Visit) => { const f = raw.places[v.place_id]?.first_ts; return f == null || v.start <= f }
  const ctx: Ctx = { d: data, raw, u: units, dist, cv, nights: bedStrip(raw, range), range, isFirst }
  const out: Fact[] = []
  for (const g of GEN) { const f = g(ctx); if (f) out.push(f) }
  return out.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
}

