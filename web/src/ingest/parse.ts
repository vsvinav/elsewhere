// Port of pipeline/parse.py: a Google Timeline export → flat records, with the same skip reasons.
export interface PVisit { id: number; start: number; end: number; tz: number; place_id: string; lat: number; lng: number; type: string; p: number; lvl: number; city?: string | null; cc?: string | null; dist?: number }
export interface PActivity { id: number; start: number; end: number; tz: number; s_lat: number; s_lng: number; e_lat: number; e_lng: number; m: number; mode: string; p: number; e_city?: string | null }
export interface PPath { start: number; end: number; pts: [number, number, number][] }
export interface PMemory { start: number; end: number; km: number; dests: string[] }
export interface Parsed {
  visits: PVisit[]; activities: PActivity[]; paths: PPath[]; memories: PMemory[]
  frequent_places: { place_id: string; lat: number; lng: number; label: string | null }[]
  frequent_trips: unknown[]; persona: unknown
  report: { segments_total: number; parsed: number; skipped_by_reason: Record<string, number> }
}

const LATLNG = /^\s*(-?\d+(?:\.\d+)?)°?\s*,\s*(-?\d+(?:\.\d+)?)°?\s*$/
const TS = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/

class Bad extends Error { constructor(public reason: string) { super(reason) } }

function latlng(s: unknown): [number, number] {
  const m = typeof s === 'string' ? LATLNG.exec(s) : null
  if (!m) throw new Bad('bad_latlng')
  const lat = +m[1], lng = +m[2]
  if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) throw new Bad('bad_latlng')
  return [lat, lng]
}

/** Epoch seconds and the string's own offset in minutes. */
function ts(s: unknown): [number, number] {
  const m = typeof s === 'string' ? TS.exec(s) : null
  if (!m) throw new Bad('bad_timestamp')
  const off = m[7] === 'Z' ? 0 : (m[7][0] === '-' ? -1 : 1) * (+m[7].slice(1, 3) * 60 + +m[7].slice(4, 6))
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000 - off * 60
  return [utc, off]
}

const num = (v: unknown, d = 0) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v !== '' && isFinite(+v) ? +v : d)
const field = (o: unknown, k: string): unknown => { if (o && typeof o === 'object' && k in o) return (o as Record<string, unknown>)[k]; throw new Bad('missing_field') }
const opt = (o: unknown, k: string): unknown => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined)

/** The export's string offset is the exporting phone's zone; the segment field carries the local one. */
function segTz(seg: unknown, stringTz: number): number {
  const off = opt(seg, 'startTimeTimezoneUtcOffsetMinutes')
  return typeof off === 'number' && Number.isInteger(off) ? off : stringTz
}

export function parseTimeline(text: string): Parsed {
  // Some exports carry terminal escape sequences from how they were copied.
  // eslint-disable-next-line no-control-regex
  const doc = JSON.parse(text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')) as Record<string, unknown>
  const out: Parsed = { visits: [], activities: [], paths: [], memories: [], frequent_places: [], frequent_trips: [], persona: {}, report: { segments_total: 0, parsed: 0, skipped_by_reason: {} } }
  const skip = (r: string) => { out.report.skipped_by_reason[r] = (out.report.skipped_by_reason[r] ?? 0) + 1 }
  const segs = Array.isArray(doc.semanticSegments) ? doc.semanticSegments : []
  segs.forEach((seg: unknown, idx: number) => {
    out.report.segments_total++
    try {
      if (opt(seg, 'visit') !== undefined) {
        const [start, stz] = ts(field(seg, 'startTime')), [end] = ts(field(seg, 'endTime'))
        const v = field(seg, 'visit'), tc = field(v, 'topCandidate')
        const [lat, lng] = latlng(field(field(tc, 'placeLocation'), 'latLng'))
        out.visits.push({ id: idx, start, end, tz: segTz(seg, stz), place_id: String(field(tc, 'placeId')), lat, lng, type: String(opt(tc, 'semanticType') ?? 'UNKNOWN'), p: num(opt(v, 'probability') ?? opt(tc, 'probability')), lvl: Math.trunc(num(opt(v, 'hierarchyLevel'))) })
      } else if (opt(seg, 'activity') !== undefined) {
        const [start, stz] = ts(field(seg, 'startTime')), [end] = ts(field(seg, 'endTime'))
        const a = field(seg, 'activity'), tc = field(a, 'topCandidate')
        const [s_lat, s_lng] = latlng(field(field(a, 'start'), 'latLng')), [e_lat, e_lng] = latlng(field(field(a, 'end'), 'latLng'))
        out.activities.push({ id: idx, start, end, tz: segTz(seg, stz), s_lat, s_lng, e_lat, e_lng, m: Math.round(num(opt(a, 'distanceMeters'))), mode: String(opt(tc, 'type') ?? 'UNKNOWN'), p: num(opt(a, 'probability') ?? opt(tc, 'probability')) })
      } else if (opt(seg, 'timelinePath') !== undefined) {
        const [start] = ts(field(seg, 'startTime')), [end] = ts(field(seg, 'endTime'))
        const raw = field(seg, 'timelinePath')
        if (!Array.isArray(raw)) throw new Bad('missing_field')
        const pts: [number, number, number][] = raw.map((p) => { const [lat, lng] = latlng(field(p, 'point')); return [ts(field(p, 'time'))[0], lat, lng] })
        out.paths.push({ start, end, pts })
      } else if (opt(seg, 'timelineMemory') !== undefined) {
        const [start] = ts(field(seg, 'startTime')), [end] = ts(field(seg, 'endTime'))
        const trip = opt(field(seg, 'timelineMemory'), 'trip') ?? {}
        const dests = (Array.isArray(opt(trip, 'destinations')) ? (opt(trip, 'destinations') as unknown[]) : []).map((d) => opt(opt(d, 'identifier'), 'placeId')).filter((x): x is string => typeof x === 'string')
        out.memories.push({ start, end, km: Math.trunc(num(opt(trip, 'distanceFromOriginKms'))), dests })
      } else { skip('unknown_segment'); return }
      out.report.parsed++
    } catch (e) { skip(e instanceof Bad ? e.reason : 'missing_field') }
  })
  const up = doc.userLocationProfile
  for (const p of (Array.isArray(opt(up, 'frequentPlaces')) ? (opt(up, 'frequentPlaces') as unknown[]) : [])) {
    try { const [lat, lng] = latlng(field(p, 'placeLocation')); out.frequent_places.push({ place_id: String(field(p, 'placeId')), lat, lng, label: (opt(p, 'label') as string | undefined) ?? null }) } catch { /* skip */ }
  }
  out.frequent_trips = (opt(up, 'frequentTrips') as unknown[]) ?? []
  out.persona = opt(up, 'persona') ?? {}
  const byStart = (a: { start: number }, b: { start: number }) => a.start - b.start
  out.visits.sort(byStart); out.activities.sort(byStart); out.paths.sort(byStart)
  return out
}
