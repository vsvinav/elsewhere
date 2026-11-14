import type { Data, Visit } from '../data/types'
import { bedStrip, longestRun, type Night } from './beds'
import { isHome } from './geo'
import { lensOf } from './lens'
import { distanceKm } from './position'
import { nightsIn } from './tour'

export type Kind = 'explored' | 'record' | 'scale' | 'habit'
export type Figure =
  | { t: 'ring'; pct: number; label: string }
  | { t: 'scale'; value: number; ref: number; refLabel: string; unit: string; valueLabel?: string }
  | { t: 'dial'; hours: number[] }
  | { t: 'week'; cells: number[] }
  | { t: 'globe'; lat: number; lng: number; homeLat: number; homeLng: number }
  | { t: 'beds'; nights: Night[] }
/** `quip` is the short, unserious version that turns on the card up top; the headline and detail stay sober below. */
export interface Fact { id: string; kind: Kind; headline: string; detail: string; figure?: Figure; quip?: string }
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

const hrs = (h: number) => (h >= 10 ? n0(h) : h.toFixed(1))
// Judged on the primary type only, so a hotel with a bar is a hotel. Hours are capped per visit: a bar
// next door soaks up home time in the raw record, and nobody shops for groceries for nine hours.
const typed = (d: Data, re: RegExp) => Object.values(d.places).filter((p) => p.role == null && re.test(p.primary_type ?? ''))
const hoursOf = (ps: { total_hours: number; n_visits: number }[], capPerVisit = 4) => ps.reduce((a, p) => a + Math.min(p.total_hours, p.n_visits * capPerVisit), 0)
const visitsOf = (ps: { n_visits: number }[]) => ps.reduce((a, p) => a + p.n_visits, 0)
const everyDays = (n: number, range: [number, number]) => Math.max(1, Math.round((range[1] - range[0]) / 86400 / Math.max(1, n)))
const BAR = /bar$|pub$|night_club|brewery|cocktail/, GYM = /^gym$|fitness|yoga|climbing|sports_club/
const CAFE = /^cafe$|coffee_shop|^coffee/, GROCERY = /grocery|supermarket|convenience_store/, AIRPORT = /airport/, FOOD = /restaurant|diner|pizza|burger|ramen|sushi|taco/
const AUDIOBOOK_H = 117

const GEN: ((c: Ctx) => Fact | null)[] = [
  // Circumnavigations
  ({ d, dist, cv, u }) => {
    const km = kmOf(d, () => true)
    if (km < 1_000) return null
    const laps = km / EARTH_KM
    return { id: 'laps', kind: 'scale', headline: laps >= 1 ? `${laps.toFixed(1)}× around the Earth` : `${Math.round(laps * 100)}% of the way around the Earth`, detail: `${dist(km)} on record, over ground, rail, water and air. The equator is ${dist(EARTH_KM)}.`, figure: { t: 'scale', value: cv(km), ref: cv(EARTH_KM), refLabel: 'Equator', unit: u }, quip: laps >= 1 ? `${laps.toFixed(1)} laps of the planet. Still no statue.` : `${Math.round(laps * 100)}% of a lap round the Earth. Keep going.` }
  },
  // Walked equals
  ({ d, dist, cv, u }) => {
    const km = kmOf(d, (m) => lensOf(m) === 'foot')
    if (km < 30) return null
    const [ref, name] = WALKS.reduce((best, w) => (Math.abs(Math.log(w[0] / km)) < Math.abs(Math.log(best[0] / km)) ? w : best))
    const ratio = km / ref
    const how = ratio > 1.15 ? `${ratio.toFixed(1)}× ` : ratio < 0.85 ? `${Math.round(ratio * 100)}% of ` : ''
    return { id: 'walked', kind: 'scale', headline: `Walked ${how}${name}`, detail: `${dist(km)} on foot. ${name[0].toUpperCase() + name.slice(1)} is about ${dist(ref)}.`, figure: { t: 'scale', value: cv(km), ref: cv(ref), refLabel: name.replace(/^the /, ''), unit: u }, quip: `Walked ${dist(km)}. Your shoes want hazard pay.` }
  },
  // Longest streak home
  ({ nights }) => {
    const r = longestRun(nights, (n) => n.kind === 'home')
    if (!r || r.n < 14) return null
    return { id: 'streak-home', kind: 'record', headline: `${r.n} nights in your own bed, straight`, detail: `${long(r.from)} to ${long(r.to)}. Your longest stretch without a night away.`, figure: { t: 'beds', nights: nights.filter((n) => n.date >= r.from && n.date <= r.to) }, quip: `${r.n} nights in your own bed, straight. Thrilling.` }
  },
  // Longest streak away
  ({ nights }) => {
    const r = longestRun(nights, (n) => n.kind === 'new' || n.kind === 'repeat')
    if (!r || r.n < 3) return null
    const cities = [...new Set(nights.filter((n) => n.date >= r.from && n.date <= r.to && n.city).map((n) => n.city))]
    return { id: 'streak-away', kind: 'record', headline: `${r.n} nights away without a night home`, detail: `${long(r.from)} to ${long(r.to)}${cities.length ? ` · ${cities.slice(0, 4).join(', ')}${cities.length > 4 ? ` and ${cities.length - 4} more` : ''}` : ''}.`, figure: { t: 'beds', nights: nights.filter((n) => n.date >= r.from && n.date <= r.to) }, quip: `${r.n} nights away in a row. Your pillow filed a missing-person report.` }
  },
  // Furthest from home
  ({ d, dist }) => {
    const home = d.profile.home
    let best: Visit | null = null, bestKm = 0
    for (const v of d.visits) { if (v.lvl !== 0) continue; const km = distanceKm(home, v); if (km > bestKm) { bestKm = km; best = v } }
    if (!best || bestKm < 100) return null
    const p = d.places[best.place_id]
    const where = p?.name ?? p?.city ?? 'an unnamed place'
    return { id: 'furthest', kind: 'record', headline: `${dist(bestKm)} from home`, detail: `${where}${p?.city && p.name ? `, ${p.city}` : ''}${p?.country_code ? ` (${p.country_code})` : ''}, ${longTs(best.start)}. The furthest your record gets.`, figure: { t: 'globe', lat: best.lat, lng: best.lng, homeLat: home.lat, homeLng: home.lng }, quip: `${dist(bestKm)} from home. Mum was worried.` }
  },
  // Fastest ground leg
  ({ d, u }) => {
    let best = { kmh: 0, mode: '', ts: 0 }
    for (const a of d.activities) {
      if (lensOf(a.mode) === 'fly' || a.end - a.start < 20 * 60 || a.m < 20_000) continue
      const kmh = (a.m / 1000) / ((a.end - a.start) / 3600)
      if (kmh > best.kmh && kmh < 400) best = { kmh, mode: a.mode, ts: a.start }
    }
    if (best.kmh < 60) return null
    const v = u === 'mi' ? best.kmh * MI : best.kmh
    return { id: 'fastest', kind: 'record', headline: `${n0(v)} ${u === 'mi' ? 'mph' : 'km/h'} door to door`, detail: `Your quickest leg over land, ${longTs(best.ts)}, by ${best.mode.replace(/^IN_/, '').replace(/_/g, ' ').toLowerCase()}. Averaged over the whole leg, stops included.`, quip: `${n0(v)} ${u === 'mi' ? 'mph' : 'km/h'} door to door. Allegedly.` }
  },
  // Earliest departure from home
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
    return { id: 'earliest', kind: 'record', headline: `Out the door at ${String(earliest.h).padStart(2, '0')}:${String(earliest.m).padStart(2, '0')}`, detail: `${longTs(earliest.ts)}, your earliest start. The dial shows what hour you usually leave home.`, figure: { t: 'dial', hours }, quip: `Out the door at ${String(earliest.h).padStart(2, '0')}:${String(earliest.m).padStart(2, '0')} once. Why.` }
  },
  // Night owl
  ({ d }) => {
    const hours = Array<number>(24).fill(0)
    let late = 0
    for (const a of d.activities) { const h = localHour(a.start, a.tz); hours[h]++; if (h >= 22 || h < 4) late++ }
    const n = d.activities.length
    if (n < 50) return null
    const share = pct(late, n)
    return { id: 'owl', kind: 'habit', headline: share >= 15 ? `Night owl · ${share}% of legs after 10 pm` : `${share}% of your legs start after 10 pm`, detail: `${n0(late)} of ${n0(n)} journeys began between 22:00 and 04:00 local time.`, figure: { t: 'dial', hours }, quip: share >= 15 ? `${share}% of trips start after 10 pm. Vampire-adjacent.` : `Only ${share}% of trips after 10 pm. Early bird, or just tired.` }
  },
  // Weekend explorer
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
    return { id: 'weekend', kind: 'habit', headline: `${share}% of new places found on a weekend`, detail: `${n0(firsts)} first visits; ${n0(weekend)} were on a Saturday or Sunday. Two days of seven is ${Math.round(200 / 7)}%.`, figure: { t: 'week', cells }, quip: `${share}% of new places found on weekends. Weekdays are for the known.` }
  },
  // Cities per 1,000 km
  ({ d, dist, cv, u }) => {
    const km = kmOf(d, () => true)
    const cities = new Set<string>()
    for (const v of sleeps(d)) { const c = d.places[v.place_id]?.city; if (c && !isHome(d.places[v.place_id])) cities.add(c) }
    if (km < 2_000 || cities.size < 2) return null
    const per = (1000 * cities.size) / km
    return { id: 'density', kind: 'scale', headline: `A new bed every ${dist(km / cities.size)}`, detail: `${cities.size} cities slept in over ${dist(km)} of travel: ${per.toFixed(1)} cities per 1,000 km.`, quip: `A new bed every ${dist(km / cities.size)}. Hotels love you.` }
  },
  // Passed through, never slept
  ({ d }) => {
    const slept = new Set<string>()
    for (const v of sleeps(d)) { const c = d.places[v.place_id]?.city; if (c) slept.add(c) }
    const passed = new Map<string, number>()
    for (const v of d.visits) { const p = d.places[v.place_id]; if (v.lvl === 0 && p?.city && p.role == null && !slept.has(p.city)) passed.set(p.city, (passed.get(p.city) ?? 0) + 1) }
    const top = [...passed.entries()].sort((a, b) => b[1] - a[1])[0]
    if (!top || top[1] < 5) return null
    return { id: 'passed', kind: 'habit', headline: `${top[0]}: ${top[1]} visits, never a night`, detail: `The city you keep passing through without ever sleeping there.`, quip: `${top[0]}: ${top[1]} visits, never a night. Commitment issues.` }
  },
  // New Year's Eve
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
    return { id: 'nye', kind: 'habit', headline: out.length === 1 ? `Midnight on New Year's, ${out[0].slice(0, 4)}` : `${out.length} New Year's Eves on record`, detail: out.join(' · ') + '.', quip: out.length === 1 ? `New Year's at ${out[0].slice(6)}. Big night.` : `${out.length} New Year's Eves, ${new Set(out.map((o) => o.slice(6))).size} different places. Restless.` }
  },
  // Time in motion
  ({ d }) => {
    const h = d.activities.reduce((a, x) => a + (x.end - x.start) / 3600, 0)
    if (h < 48) return null
    const days = h / 24
    return { id: 'motion', kind: 'scale', headline: `${days >= 10 ? n0(days) : days.toFixed(1)} whole days in motion`, detail: `${n0(h)} hours in a vehicle or on foot between places: ${pct(h, (d.meta.range[1] - d.meta.range[0]) / 3600)}% of the record.`, quip: `${days >= 10 ? n0(days) : days.toFixed(1)} days of your life in transit. Podcast people.` }
  },
  // Bars against gyms
  ({ d }) => {
    const bars = hoursOf(typed(d, BAR)), gym = hoursOf(typed(d, GYM))
    if (bars < 4 && gym < 4) return null
    const head = gym > bars ? `Gym ${hrs(gym)} h · bars ${hrs(bars)} h` : `Bars ${hrs(bars)} h · gym ${hrs(gym)} h`
    const detail = gym === 0 ? `${hrs(bars)} hours in bars and pubs. No gym appears anywhere in this record. Balance is a myth anyway.`
      : gym > bars ? `The gym is winning, ${(gym / Math.max(0.1, bars)).toFixed(1)} hours of reps to every hour at the bar. Suspicious.`
      : `${(bars / Math.max(0.1, gym)).toFixed(1)} hours at the bar for every hour at the gym. The science is unsettled on whether that cancels out.`
    return { id: 'bars', kind: 'habit', headline: head, detail, figure: { t: 'scale', value: bars, ref: gym, refLabel: 'Gym', unit: 'h', valueLabel: 'Bars' }, quip: gym === 0 ? `${hrs(bars)} hours in bars, zero at the gym. Balanced.` : gym > bars ? `More gym than bar. Who even are you?` : `${hrs(bars)} hours in bars, ${hrs(gym)} at the gym. Your liver is the one lifting.` }
  },
  // Coffee runs
  ({ d, range }) => {
    const ps = typed(d, CAFE), n = visitsOf(ps)
    if (n < 8) return null
    return { id: 'coffee', kind: 'habit', headline: `${n0(n)} coffee runs · one every ${everyDays(n, range)} days`, detail: `${hrs(hoursOf(ps, 3))} hours in ${ps.length} cafés, waiting for, drinking, or pretending to work over coffee.`, quip: `${n0(n)} coffee runs. That's not a habit, that's a personality.` }
  },
  // Airports
  ({ d }) => {
    const h = hoursOf(typed(d, AIRPORT), 8)
    if (h < 6) return null
    return { id: 'airports', kind: 'scale', headline: `${hrs(h)} hours inside airports`, detail: `${(h / 8).toFixed(1)} full working days of boarding groups, gate changes and ${h > 40 ? 'overpriced' : 'surprisingly fine'} sandwiches.`, figure: { t: 'scale', value: h, ref: 40, refLabel: 'A working week', unit: 'h' }, quip: `${hrs(h)} hours in airports. You basically live at gate B12.` }
  },
  // Grocery runs
  ({ d, range }) => {
    const ps = typed(d, GROCERY), n = visitsOf(ps)
    if (n < 6) return null
    return { id: 'grocery', kind: 'habit', headline: `${n0(n)} grocery runs`, detail: `One every ${everyDays(n, range)} days, ${hrs(hoursOf(ps, 2))} hours in the aisles. Nobody has ever gone in for just milk.`, quip: `${n0(n)} grocery runs, zero of them 'just for milk'.` }
  },
  // Restaurant loyalty
  ({ d }) => {
    const p = typed(d, FOOD).filter((x) => x.name && x.n_visits >= 4).sort((a, b) => b.n_visits - a.n_visits)[0]
    if (!p) return null
    return { id: 'regular', kind: 'habit', headline: `${p.name}, ${p.n_visits} times`, detail: `Your most loyal restaurant${p.city ? `, in ${p.city}` : ''}. ${hrs(p.total_hours)} hours at the table. There are other menus; you have chosen not to read them.`, quip: `${p.name} has seen you ${p.n_visits} times. They know your order.` }
  },
  // Longest time without leaving the house
  ({ d }) => {
    let best: Visit | null = null
    for (const v of d.visits) if (v.lvl === 0 && isHome(d.places[v.place_id]) && (!best || v.end - v.start > best.end - best.start)) best = v
    if (!best || best.end - best.start < 36 * 3600) return null
    const h = (best.end - best.start) / 3600
    return { id: 'hermit', kind: 'record', headline: `${hrs(h)} hours without leaving the house`, detail: `${longTs(best.start)} to ${longTs(best.end)}. ${h >= 72 ? 'The outside world managed without you.' : 'A proper weekend in.'}`, quip: `${hrs(h)} hours without going outside. Impressive. Slightly concerning.` }
  },
  // Longest single stay away
  ({ d }) => {
    let best: Visit | null = null
    for (const v of d.visits) { const p = d.places[v.place_id]; if (v.lvl === 0 && p?.role == null && (!best || v.end - v.start > best.end - best.start)) best = v }
    if (!best || best.end - best.start < 20 * 3600) return null
    const p = d.places[best.place_id], h = (best.end - best.start) / 3600
    return { id: 'longest-stay', kind: 'record', headline: `${hrs(h)} hours straight at ${p?.name ?? p?.city ?? 'one place'}`, detail: `From ${longTs(best.start)}. Your longest unbroken stay anywhere that wasn't home or work${p?.name && p.city ? `, in ${p.city}` : ''}.`, quip: `${hrs(h)} hours straight at ${p?.name ?? 'one place'}. Did you live there?` }
  },
  // Days since anywhere new
  ({ d, raw, isFirst, range }) => {
    let last = 0
    for (const v of nonRoutine(d)) if (isFirst(v) && v.start > last) last = v.start
    if (!last || nonRoutine(raw).length < 20) return null
    const days = Math.floor((range[1] - last) / 86400)
    if (days < 3) return null
    const p = d.places[d.visits.find((v) => v.start === last)?.place_id ?? '']
    return { id: 'since-new', kind: 'habit', headline: `${n0(days)} days since you went anywhere new`, detail: `Last first visit: ${p?.name ?? p?.city ?? 'an unnamed place'}, ${longTs(last)}. ${days > 30 ? 'The map is not going to explore itself.' : 'Not bad. Keep it up.'}`, quip: `${n0(days)} days since anywhere new. The map is judging you.` }
  },
  // Time zones lived in
  ({ d }) => {
    const tz = new Map<number, number>()
    for (const v of d.visits) if (v.lvl === 0) tz.set(v.tz, (tz.get(v.tz) ?? 0) + (v.end - v.start) / 3600)
    const zones = [...tz.entries()].filter(([, h]) => h >= 24).map(([z]) => z)
    if (zones.length < 2) return null
    const fmt = (m: number) => `UTC${m < 0 ? '−' : '+'}${Math.floor(Math.abs(m) / 60)}${Math.abs(m) % 60 ? `:${String(Math.abs(m) % 60).padStart(2, '0')}` : ''}`
    const lo = Math.min(...zones), hi = Math.max(...zones)
    return { id: 'zones', kind: 'explored', headline: `${zones.length} time zones slept in`, detail: `Your body clock has run from ${fmt(lo)} to ${fmt(hi)}, a ${((hi - lo) / 60).toFixed(1)}-hour spread. Counting only zones you spent a full day in.`, figure: { t: 'ring', pct: (100 * zones.length) / 24, label: 'of 24' }, quip: `${zones.length} time zones. Your body clock has given up.` }
  },
  // Hours behind the wheel
  ({ d }) => {
    const h = d.activities.reduce((a, x) => a + (lensOf(x.mode) === 'drive' ? (x.end - x.start) / 3600 : 0), 0)
    if (h < 20) return null
    const times = h / AUDIOBOOK_H
    return { id: 'wheel', kind: 'scale', headline: `${hrs(h)} hours in a car`, detail: `Enough to hear all seven Harry Potter audiobooks ${times >= 1 ? `${times.toFixed(1)} times over` : `${Math.round(times * 100)}% of the way through`}. Or sit in silence. Your call.`, figure: { t: 'scale', value: h, ref: AUDIOBOOK_H, refLabel: 'All seven audiobooks', unit: 'h' }, quip: `${hrs(h)} hours in a car. Hope the playlist held up.` }
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

