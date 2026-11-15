import type { Data, Visit } from '../data/types'
import type { Door } from '../store/useStore'
import { bedStrip, longestRun, type Night } from './beds'
import { dateRange, dayRange, monthRange, onePerCountry, placesInCity } from './doors'
import { isHome } from './geo'
import { lensOf } from './lens'
import { distanceKm } from './position'
import { nightsIn } from './tour'
import { flights } from '../world/flights'

export type Kind = 'explored' | 'record' | 'scale' | 'habit'
export type Figure =
  | { t: 'ring'; pct: number; label: string }
  | { t: 'scale'; value: number; ref: number; refLabel: string; unit: string; valueLabel?: string }
  | { t: 'dial'; hours: number[]; hand: number; arc?: [number, number]; label: string }
  | { t: 'week'; cells: number[] }
  | { t: 'globe'; lat: number; lng: number; homeLat: number; homeLng: number }
  | { t: 'beds'; nights: Night[] }
/**
 * Card facts are the short, unserious ones that turn on the card up top (`quip` is what it says); the rest print below.
 * `door` is where the headline leads on the map: the window or the pins that made it. Its label is filled in from the headline.
 */
export interface Fact { id: string; kind: Kind; headline: string; detail: string; figure?: Figure; card?: true; quip?: string; door: Door }
type Lead = Door extends infer D ? (D extends Door ? Omit<D, 'label'> : never) : never
export type Units = 'km' | 'mi'

const EARTH_KM = 40_075, MI = 0.621371
const n0 = (x: number) => Math.round(x).toLocaleString('en-US')
const long = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
const longTs = (ts: number) => long(new Date(ts * 1000).toISOString().slice(0, 10))
const localHour = (ts: number, tz: number) => new Date((ts + tz * 60) * 1000).getUTCHours()
const localDow = (ts: number, tz: number) => (new Date((ts + tz * 60) * 1000).getUTCDay() + 6) % 7
const COUNTRIES = 195
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
const typed = (d: Data, re: RegExp) => Object.entries(d.places).filter(([, p]) => p.role == null && re.test(p.primary_type ?? '')).map(([id, p]) => ({ id, ...p }))
const ids = (ps: { id: string }[]) => ps.map((p) => p.id)
const whole = (c: Ctx): Lead => ({ kind: 'range', from: c.range[0], to: c.range[1] })
const days = (from: string, to: string): Lead => ({ kind: 'range', from: dateRange(from)[0], to: dateRange(to)[1] })
const pins = (placeIds: string[]): Lead => ({ kind: 'places', placeIds })
const hoursOf = (ps: { total_hours: number; n_visits: number }[], capPerVisit = 4) => ps.reduce((a, p) => a + Math.min(p.total_hours, p.n_visits * capPerVisit), 0)
const visitsOf = (ps: { n_visits: number }[]) => ps.reduce((a, p) => a + p.n_visits, 0)
const everyDays = (n: number, range: [number, number]) => Math.max(1, Math.round((range[1] - range[0]) / 86400 / Math.max(1, n)))
const BAR = /bar$|pub$|night_club|brewery|cocktail/, GYM = /^gym$|fitness|yoga|climbing|sports_club/
const CAFE = /^cafe$|coffee_shop|^coffee/, GROCERY = /grocery|supermarket|convenience_store/, AIRPORT = /airport/, FOOD = /restaurant|diner|pizza|burger|ramen|sushi|taco/
const AUDIOBOOK_H = 117

type Draft = Omit<Fact, 'door'> & { door: Lead }

const GEN: ((c: Ctx) => Draft | null)[] = [
  // Circumnavigations
  (c) => {
    const { d, dist, cv, u } = c
    const km = kmOf(d, () => true)
    if (km < 1_000) return null
    const laps = km / EARTH_KM
    return { id: 'laps', door: whole(c), kind: 'scale', headline: laps >= 1 ? `${laps.toFixed(1)}× around the Earth` : `${Math.round(laps * 100)}% of the way around the Earth`, detail: `${dist(km)} on record, over ground, rail, water and air. The equator is ${dist(EARTH_KM)}.`, figure: { t: 'scale', value: cv(km), ref: cv(EARTH_KM), refLabel: 'Equator', unit: u } }
  },
  // Walked equals
  (c) => {
    const { d, dist, cv, u } = c
    const km = kmOf(d, (m) => lensOf(m) === 'foot')
    if (km < 30) return null
    const [ref, name] = WALKS.reduce((best, w) => (Math.abs(Math.log(w[0] / km)) < Math.abs(Math.log(best[0] / km)) ? w : best))
    const ratio = km / ref
    const how = ratio > 1.15 ? `${ratio.toFixed(1)}× ` : ratio < 0.85 ? `${Math.round(ratio * 100)}% of ` : ''
    return { id: 'walked', door: whole(c), kind: 'scale', headline: `Walked ${how}${name}`, detail: `${dist(km)} on foot. ${name[0].toUpperCase() + name.slice(1)} is about ${dist(ref)}.`, figure: { t: 'scale', value: cv(km), ref: cv(ref), refLabel: name.replace(/^the /, ''), unit: u } }
  },
  // Longest streak home
  ({ nights }) => {
    const r = longestRun(nights, (n) => n.kind === 'home')
    if (!r || r.n < 14) return null
    return { id: 'streak-home', door: days(r.from, r.to), kind: 'record', headline: `${r.n} nights in your own bed, straight`, detail: `${long(r.from)} to ${long(r.to)}. Your longest stretch without a night away.`, figure: { t: 'beds', nights: nights.filter((n) => n.date >= r.from && n.date <= r.to) } }
  },
  // Longest streak away
  ({ nights }) => {
    const r = longestRun(nights, (n) => n.kind === 'new' || n.kind === 'repeat')
    if (!r || r.n < 3) return null
    const cities = [...new Set(nights.filter((n) => n.date >= r.from && n.date <= r.to && n.city).map((n) => n.city))]
    return { id: 'streak-away', door: days(r.from, r.to), kind: 'record', headline: `${r.n} nights away without a night home`, detail: `${long(r.from)} to ${long(r.to)}${cities.length ? ` · ${cities.slice(0, 4).join(', ')}${cities.length > 4 ? ` and ${cities.length - 4} more` : ''}` : ''}.`, figure: { t: 'beds', nights: nights.filter((n) => n.date >= r.from && n.date <= r.to) } }
  },
  // Furthest from home
  ({ d, dist }) => {
    const home = d.profile.home
    let best: Visit | null = null, bestKm = 0
    for (const v of d.visits) { if (v.lvl !== 0) continue; const km = distanceKm(home, v); if (km > bestKm) { bestKm = km; best = v } }
    if (!best || bestKm < 100) return null
    const p = d.places[best.place_id]
    const where = p?.name ?? p?.city ?? 'an unnamed place'
    return { id: 'furthest', door: { kind: 'place', placeId: best.place_id, at: best.start }, kind: 'record', headline: `${dist(bestKm)} from home`, detail: `${where}${p?.city && p.name ? `, ${p.city}` : ''}${p?.country_code ? ` (${p.country_code})` : ''}, ${longTs(best.start)}. The furthest your record gets.`, figure: { t: 'globe', lat: best.lat, lng: best.lng, homeLat: home.lat, homeLng: home.lng } }
  },
  // Fastest ground leg
  ({ d, u }) => {
    let best = { kmh: 0, mode: '', ts: 0, end: 0 }
    for (const a of d.activities) {
      const lens = lensOf(a.mode)
      // Timeline sometimes labels a flight "walking"; only legs plausible for their mode count.
      if (lens === 'fly' || lens === 'foot' || a.end - a.start < 20 * 60 || a.m < 20_000) continue
      const kmh = (a.m / 1000) / ((a.end - a.start) / 3600)
      if (kmh > best.kmh && kmh < (lens === 'drive' ? 180 : 350)) best = { kmh, mode: a.mode, ts: a.start, end: a.end }
    }
    if (best.kmh < 60) return null
    const v = u === 'mi' ? best.kmh * MI : best.kmh
    return { id: 'fastest', door: { kind: 'range', from: best.ts, to: best.end }, kind: 'record', headline: `${n0(v)} ${u === 'mi' ? 'mph' : 'km/h'} door to door`, detail: `Your quickest leg over land, ${longTs(best.ts)}, by ${best.mode.replace(/^IN_/, '').replace(/_/g, ' ').toLowerCase()}. Averaged over the whole leg, stops included.` }
  },
  // Earliest departure from home
  ({ d }) => {
    const hours = Array<number>(24).fill(0)
    let earliest: { h: number; m: number; ts: number; tz: number } | null = null
    for (let i = 1; i < d.visits.length; i++) {
      const prev = d.visits[i - 1], v = d.visits[i]
      if (!isHome(d.places[prev.place_id]) || isHome(d.places[v.place_id]) || prev.lvl || v.lvl) continue
      const loc = new Date((prev.end + prev.tz * 60) * 1000)
      const h = loc.getUTCHours(), m = loc.getUTCMinutes()
      hours[h]++
      const score = h < 12 ? h * 60 + m : 24 * 60
      if (score >= 3 * 60 && (!earliest || score < earliest.h * 60 + earliest.m)) earliest = { h, m, ts: prev.end, tz: prev.tz }
    }
    if (!earliest || hours.reduce((a, b) => a + b, 0) < 20) return null
    const day = dayRange(earliest.ts, earliest.tz)
    return { id: 'earliest', door: { kind: 'range', from: day[0], to: day[1] }, kind: 'record', headline: `Out the door at ${String(earliest.h).padStart(2, '0')}:${String(earliest.m).padStart(2, '0')}`, detail: `${longTs(earliest.ts)}, your earliest start. The clock points at it; the faint bars are the hours you usually leave home.`, figure: { t: 'dial', hours, hand: earliest.h + earliest.m / 60, label: `${String(earliest.h).padStart(2, '0')}:${String(earliest.m).padStart(2, '0')}` } }
  },
  // Night owl
  (c) => {
    const { d } = c
    const hours = Array<number>(24).fill(0)
    let late = 0
    for (const a of d.activities) { const h = localHour(a.start, a.tz); hours[h]++; if (h >= 22 || h < 4) late++ }
    const n = d.activities.length
    if (n < 50) return null
    const share = pct(late, n)
    const peak = hours.reduce((b, v, h) => (v > hours[b] ? h : b), 0)
    return { id: 'owl', door: whole(c), kind: 'habit', headline: share >= 15 ? `Night owl · ${share}% of legs after 10 pm` : `${share}% of your legs start after 10 pm`, detail: `${n0(late)} of ${n0(n)} journeys began between 22:00 and 04:00 local time. The hand points at your busiest hour.`, figure: { t: 'dial', hours, hand: peak + 0.5, arc: [22, 28], label: `${String(peak).padStart(2, '0')}:00` } }
  },
  // Weekend explorer
  ({ d, isFirst }) => {
    const cells = Array<number>(7 * 24).fill(0)
    let firsts = 0, weekend = 0
    const found = new Set<string>()
    for (const v of nonRoutine(d)) {
      if (!isFirst(v)) continue
      firsts++
      const dow = localDow(v.start, v.tz)
      cells[dow * 24 + localHour(v.start, v.tz)]++
      if (dow >= 5) { weekend++; found.add(v.place_id) }
    }
    if (firsts < 20) return null
    const share = pct(weekend, firsts)
    return { id: 'weekend', door: pins([...found]), kind: 'habit', headline: `${share}% of new places found on a weekend`, detail: `${n0(firsts)} first visits; ${n0(weekend)} were on a Saturday or Sunday. Two days of seven is ${Math.round(200 / 7)}%.`, figure: { t: 'week', cells } }
  },
  // Cities per 1,000 km
  ({ d, dist, cv, u }) => {
    const km = kmOf(d, () => true)
    const cities = new Set<string>(), beds = new Set<string>()
    for (const v of sleeps(d)) { const c = d.places[v.place_id]?.city; if (c && !isHome(d.places[v.place_id])) { cities.add(c); beds.add(v.place_id) } }
    if (km < 2_000 || cities.size < 2) return null
    const per = (1000 * cities.size) / km
    return { id: 'density', door: pins([...beds]), kind: 'scale', headline: `A new bed every ${dist(km / cities.size)}`, detail: `${cities.size} cities slept in over ${dist(km)} of travel: ${per.toFixed(1)} cities per 1,000 km.` }
  },
  // Passed through, never slept
  ({ d }) => {
    const slept = new Set<string>()
    for (const v of sleeps(d)) { const c = d.places[v.place_id]?.city; if (c) slept.add(c) }
    const passed = new Map<string, number>()
    for (const v of d.visits) { const p = d.places[v.place_id]; if (v.lvl === 0 && p?.city && p.role == null && !slept.has(p.city)) passed.set(p.city, (passed.get(p.city) ?? 0) + 1) }
    const top = [...passed.entries()].sort((a, b) => b[1] - a[1])[0]
    if (!top || top[1] < 5) return null
    return { id: 'passed', door: pins(placesInCity(d.places, top[0])), kind: 'habit', headline: `${top[0]}: ${top[1]} visits, never a night`, detail: `The city you keep passing through without ever sleeping there.` }
  },
  // New Year's Eve
  ({ d, range }) => {
    const out: string[] = [], at: string[] = []
    const y0 = new Date(range[0] * 1000).getUTCFullYear(), y1 = new Date(range[1] * 1000).getUTCFullYear()
    for (let y = y0 + 1; y <= y1; y++) {
      const ts = Date.UTC(y, 0, 1) / 1000
      const v = d.visits.find((x) => x.lvl === 0 && x.start - x.tz * 60 <= ts && x.end - x.tz * 60 >= ts)
      if (!v) continue
      const p = d.places[v.place_id]
      at.push(v.place_id)
      out.push(`${y}: ${isHome(p) ? 'home' : p?.name ?? p?.city ?? 'somewhere unnamed'}${!isHome(p) && p?.city && p.name ? `, ${p.city}` : ''}`)
    }
    if (!out.length) return null
    return { id: 'nye', door: pins(at), kind: 'habit', headline: out.length === 1 ? `Midnight on New Year's, ${out[0].slice(0, 4)}` : `${out.length} New Year's Eves on record`, detail: out.join(' · ') + '.' }
  },
  // Time in motion
  (c) => {
    const { d } = c
    const h = d.activities.reduce((a, x) => a + (x.end - x.start) / 3600, 0)
    if (h < 48) return null
    const days = h / 24
    return { id: 'motion', door: whole(c), kind: 'scale', headline: `${days >= 10 ? n0(days) : days.toFixed(1)} whole days in motion`, detail: `${n0(h)} hours in a vehicle or on foot between places: ${pct(h, (d.meta.range[1] - d.meta.range[0]) / 3600)}% of the record.` }
  },
  // Bars against gyms
  ({ d }) => {
    const barPs = typed(d, BAR), gymPs = typed(d, GYM)
    const bars = hoursOf(barPs), gym = hoursOf(gymPs)
    if (bars < 4 && gym < 4) return null
    const head = gym > bars ? `Gym ${hrs(gym)} h · bars ${hrs(bars)} h` : `Bars ${hrs(bars)} h · gym ${hrs(gym)} h`
    const detail = gym === 0 ? `${hrs(bars)} hours in bars and pubs. No gym appears anywhere in this record. Balance is a myth anyway.`
      : gym > bars ? `The gym is winning, ${(gym / Math.max(0.1, bars)).toFixed(1)} hours of reps to every hour at the bar. Suspicious.`
      : `${(bars / Math.max(0.1, gym)).toFixed(1)} hours at the bar for every hour at the gym. The science is unsettled on whether that cancels out.`
    return { id: 'bars', door: pins(ids([...barPs, ...gymPs])), kind: 'habit', card: true, headline: head, detail, figure: { t: 'scale', value: bars, ref: gym, refLabel: 'Gym', unit: 'h', valueLabel: 'Bars' }, quip: gym === 0 ? `${hrs(bars)} hours in bars, zero at the gym. Balanced.` : gym > bars ? `More gym than bar. Who even are you?` : `${hrs(bars)} hours in bars, ${hrs(gym)} at the gym. Your liver is the one lifting.` }
  },
  // Coffee runs
  ({ d, range }) => {
    const ps = typed(d, CAFE), n = visitsOf(ps)
    if (n < 8) return null
    return { id: 'coffee', door: pins(ids(ps)), kind: 'habit', card: true, headline: `${n0(n)} coffee runs · one every ${everyDays(n, range)} days`, detail: `${hrs(hoursOf(ps, 3))} hours in ${ps.length} cafés, waiting for, drinking, or pretending to work over coffee.`, quip: `${n0(n)} coffee runs. That's not a habit, that's a personality.` }
  },
  // Airports
  ({ d }) => {
    const ps = typed(d, AIRPORT), h = hoursOf(ps, 8)
    if (h < 6) return null
    return { id: 'airports', door: pins(ids(ps)), kind: 'scale', headline: `${hrs(h)} hours inside airports`, detail: `${(h / 8).toFixed(1)} full working days of boarding groups, gate changes and ${h > 40 ? 'overpriced' : 'surprisingly fine'} sandwiches.`, figure: { t: 'scale', value: h, ref: 40, refLabel: 'A working week', unit: 'h' } }
  },
  // Grocery runs
  ({ d, range }) => {
    const ps = typed(d, GROCERY), n = visitsOf(ps)
    if (n < 6) return null
    return { id: 'grocery', door: pins(ids(ps)), kind: 'habit', card: true, headline: `${n0(n)} grocery runs`, detail: `One every ${everyDays(n, range)} days, ${hrs(hoursOf(ps, 2))} hours in the aisles. Nobody has ever gone in for just milk.`, quip: `${n0(n)} grocery runs, zero of them 'just for milk'.` }
  },
  // Restaurant loyalty
  ({ d }) => {
    const p = typed(d, FOOD).filter((x) => x.name && x.n_visits >= 4).sort((a, b) => b.n_visits - a.n_visits)[0]
    if (!p) return null
    return { id: 'regular', door: { kind: 'place', placeId: p.id }, kind: 'habit', card: true, headline: `${p.name}, ${p.n_visits} times`, detail: `Your most loyal restaurant${p.city ? `, in ${p.city}` : ''}. ${hrs(p.total_hours)} hours at the table. There are other menus; you have chosen not to read them.`, quip: `${p.name} has seen you ${p.n_visits} times. They know your order.` }
  },
  // Longest time without leaving the house
  ({ d }) => {
    let best: Visit | null = null
    for (const v of d.visits) if (v.lvl === 0 && isHome(d.places[v.place_id]) && (!best || v.end - v.start > best.end - best.start)) best = v
    if (!best || best.end - best.start < 36 * 3600) return null
    const h = (best.end - best.start) / 3600
    return { id: 'hermit', door: { kind: 'range', from: best.start, to: best.end }, kind: 'record', headline: `${hrs(h)} hours without leaving the house`, detail: `${longTs(best.start)} to ${longTs(best.end)}. ${h >= 72 ? 'The outside world managed without you.' : 'A proper weekend in.'}` }
  },
  // Longest single stay away
  ({ d }) => {
    let best: Visit | null = null
    for (const v of d.visits) { const p = d.places[v.place_id]; if (v.lvl === 0 && p?.role == null && (!best || v.end - v.start > best.end - best.start)) best = v }
    if (!best || best.end - best.start < 20 * 3600) return null
    const p = d.places[best.place_id], h = (best.end - best.start) / 3600
    return { id: 'longest-stay', door: { kind: 'place', placeId: best.place_id, at: best.start }, kind: 'record', headline: `${hrs(h)} hours straight at ${p?.name ?? p?.city ?? 'one place'}`, detail: `From ${longTs(best.start)}. Your longest unbroken stay anywhere that wasn't home or work${p?.name && p.city ? `, in ${p.city}` : ''}.` }
  },
  // Days since anywhere new
  (c) => {
    const { d, raw, isFirst, range } = c
    let last = 0
    for (const v of nonRoutine(d)) if (isFirst(v) && v.start > last) last = v.start
    if (!last || nonRoutine(raw).length < 20) return null
    const days = Math.floor((range[1] - last) / 86400)
    if (days < 3) return null
    const lastId = d.visits.find((v) => v.start === last)?.place_id ?? ''
    const p = d.places[lastId]
    return { id: 'since-new', door: lastId ? { kind: 'place', placeId: lastId, at: last } : whole(c), kind: 'habit', card: true, headline: `${n0(days)} days since you went anywhere new`, detail: `Last first visit: ${p?.name ?? p?.city ?? 'an unnamed place'}, ${longTs(last)}. ${days > 30 ? 'The map is not going to explore itself.' : 'Not bad. Keep it up.'}`, quip: `${n0(days)} days since anywhere new. The map is judging you.` }
  },
  // Time zones lived in
  (c) => {
    const { d } = c
    const tz = new Map<number, number>()
    for (const v of d.visits) if (v.lvl === 0) tz.set(v.tz, (tz.get(v.tz) ?? 0) + (v.end - v.start) / 3600)
    const zones = [...tz.entries()].filter(([, h]) => h >= 24).map(([z]) => z)
    if (zones.length < 2) return null
    const fmt = (m: number) => `UTC${m < 0 ? '−' : '+'}${Math.floor(Math.abs(m) / 60)}${Math.abs(m) % 60 ? `:${String(Math.abs(m) % 60).padStart(2, '0')}` : ''}`
    const lo = Math.min(...zones), hi = Math.max(...zones)
    return { id: 'zones', door: whole(c), kind: 'explored', headline: `${zones.length} time zones slept in`, detail: `Your body clock has run from ${fmt(lo)} to ${fmt(hi)}, a ${((hi - lo) / 60).toFixed(1)}-hour spread. Counting only zones you spent a full day in.`, figure: { t: 'ring', pct: (100 * zones.length) / 24, label: 'of 24' } }
  },
  // Hours behind the wheel
  (c) => {
    const { d } = c
    const h = d.activities.reduce((a, x) => a + (lensOf(x.mode) === 'drive' ? (x.end - x.start) / 3600 : 0), 0)
    if (h < 20) return null
    const times = h / AUDIOBOOK_H
    return { id: 'wheel', door: whole(c), kind: 'scale', headline: `${hrs(h)} hours in a car`, detail: `Enough to hear all seven Harry Potter audiobooks ${times >= 1 ? `${times.toFixed(1)} times over` : `${Math.round(times * 100)}% of the way through`}. Or sit in silence. Your call.`, figure: { t: 'scale', value: h, ref: AUDIOBOOK_H, refLabel: 'All seven audiobooks', unit: 'h' } }
  },
  // Homebody share
  (c) => {
    const { nights } = c
    const known = nights.filter((n) => n.kind !== 'none')
    if (known.length < 30) return null
    const home = pct(known.filter((n) => n.kind === 'home').length, known.length)
    return { id: 'homebody', door: whole(c), kind: 'habit', card: true, headline: `${home}% of nights in your own bed`, detail: `${n0(known.length)} nights on record.`, quip: home >= 85 ? `${home}% of nights in your own bed. Homebody.` : home >= 60 ? `${home}% of nights at home. The other ${100 - home}% is where the stories are.` : `Only ${home}% of nights at home. Does your landlord know?` }
  },
  // Second city
  ({ d }) => {
    const h = new Map<string, number>()
    for (const v of d.visits) { const p = d.places[v.place_id]; if (v.lvl === 0 && p?.city && p.role == null && !isHome(p)) h.set(p.city, (h.get(p.city) ?? 0) + (v.end - v.start) / 3600) }
    const homeCity = Object.values(d.places).find(isHome)?.city
    const top = [...h.entries()].filter(([c]) => c !== homeCity).sort((a, b) => b[1] - a[1])[0]
    if (!top || top[1] < 48) return null
    return { id: 'second-city', door: pins(placesInCity(d.places, top[0])), kind: 'habit', card: true, headline: `${top[0]}: ${hrs(top[1])} hours`, detail: `The city you spend most time in that isn't home.`, quip: `${hrs(top[1])} hours in ${top[0]}. At this point it's a situationship.` }
  },
  // Shop hours
  ({ d }) => {
    const ps = typed(d, /store|shop|mall|boutique|market/), h = hoursOf(ps, 3)
    if (h < 10) return null
    return { id: 'shops', door: pins(ids(ps)), kind: 'habit', card: true, headline: `${hrs(h)} hours in shops`, detail: `Capped at three hours a visit.`, quip: `${hrs(h)} hours in shops. "Just looking," you said, ${n0(visitsOf(ps))} times.` }
  },
  // Transit stops
  ({ d }) => {
    const ps = typed(d, /transit_station|bus_station|subway_station|train_station|light_rail/), n = visitsOf(ps)
    if (n < 10) return null
    return { id: 'transit', door: pins(ids(ps)), kind: 'habit', card: true, headline: `${n0(n)} station visits`, detail: `${hrs(hoursOf(ps, 1))} hours on platforms.`, quip: `${n0(n)} times through a station, ${hrs(hoursOf(ps, 1))} hours on platforms. The train is always "2 minutes" away.` }
  },
  // Nights away as hotel floors
  (c) => {
    const { nights } = c
    const away = nights.filter((n) => n.kind === 'new' || n.kind === 'repeat').length
    if (away < 7) return null
    return { id: 'away', door: whole(c), kind: 'scale', headline: `${n0(away)} nights in a bed that wasn't yours`, detail: away >= 30 ? `About ${(away / 30).toFixed(1)} months of the record spent away. Red nights were somewhere new; mustard, somewhere you'd been before.` : `${pct(away, nights.length)}% of the nights in this range. Red nights were somewhere new; mustard, somewhere you'd been before.`, figure: { t: 'beds', nights } }
  },
  // New vs repeat
  ({ d, isFirst }) => {
    const vs = nonRoutine(d)
    if (vs.length < 20) return null
    const firsts = vs.filter(isFirst), fresh = firsts.length
    const share = pct(fresh, vs.length)
    return { id: 'fresh', door: pins([...new Set(firsts.map((v) => v.place_id))]), kind: 'habit', card: true, headline: `${share}% of stops were somewhere new`, detail: `${n0(fresh)} first-time places out of ${n0(vs.length)} stops away from home and work.`, figure: { t: 'ring', pct: share, label: 'new' }, quip: share >= 50 ? `${share}% of your stops were somewhere new. Commitment issues, or curiosity.` : `${100 - share}% of stops were places you'd already been. You have favourites.` }
  },
  // Favourite stop
  ({ d }) => {
    const best = Object.entries(d.places).filter(([, p]) => p.role == null && p.n_visits >= 5).sort((a, b) => b[1].n_visits - a[1].n_visits)[0]
    if (!best) return null
    const [id, p] = best
    return { id: 'fav', door: { kind: 'place', placeId: id }, kind: 'habit', headline: `${p.name ?? 'One unnamed place'} · ${p.n_visits} visits`, detail: `${p.name ? '' : 'Add a Google Maps key to name it. '}Your most visited stop that isn't home or work${p.city ? `, in ${p.city}` : ''}. ${n0(p.total_hours)} hours there in all.` }
  },
  // Most-flown route
  (c) => {
    const { d, dist } = c
    const { hops, ports } = flights(d)
    const top = [...hops].sort((a, b) => b.n - a.n || b.km - a.km)[0]
    if (!top || top.n < 2) return null
    const name = (p: [number, number]) => ports.find((x) => Math.abs(x.p[0] - p[0]) < 0.1 && Math.abs(x.p[1] - p[1]) < 0.1)?.name || 'somewhere'
    return { id: 'route', door: whole(c), kind: 'record', headline: `${name(top.s)} ↔ ${name(top.t)}, ${top.n} times`, detail: `Your most-flown route, ${dist(top.km)} each way. ${dist(top.km * top.n)} on this one line alone.` }
  },
  // Countries
  ({ d }) => {
    const cc = new Set<string>()
    for (const p of Object.values(d.places)) if (p.country_code) cc.add(p.country_code)
    if (cc.size < 2) return null
    return { id: 'countries', door: pins(onePerCountry(d.places)), kind: 'explored', headline: `${cc.size} of ${COUNTRIES} countries`, detail: `${pct(cc.size, COUNTRIES)}% of the world's countries have your footprints in them: ${[...cc].sort().join(', ')}.`, figure: { t: 'ring', pct: (100 * cc.size) / COUNTRIES, label: 'countries' } }
  },
  // Busiest travel month
  ({ d, dist, nights }) => {
    const km = new Map<string, number>()
    for (const a of d.activities) { const k = new Date((a.start + a.tz * 60) * 1000).toISOString().slice(0, 7); km.set(k, (km.get(k) ?? 0) + a.m / 1000) }
    const top = [...km.entries()].sort((a, b) => b[1] - a[1])[0]
    if (!top || km.size < 3) return null
    const away = nights.filter((n) => n.date.startsWith(top[0]) && n.kind !== 'home' && n.kind !== 'none').length
    const name = new Date(top[0] + '-01T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' })
    const win = monthRange(top[0])
    return { id: 'month', door: { kind: 'range', from: win[0], to: win[1] }, kind: 'record', headline: `${name}: ${dist(top[1])}`, detail: `Your busiest month, ${away} nights away. The average month was ${dist([...km.values()].reduce((a, b) => a + b, 0) / km.size)}.`, figure: { t: 'beds', nights: nights.filter((n) => n.date.startsWith(top[0])) } }
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
  for (const g of GEN) { const f = g(ctx); if (f) out.push({ ...f, door: { ...f.door, label: f.headline } as Door }) }
  return out.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
}

