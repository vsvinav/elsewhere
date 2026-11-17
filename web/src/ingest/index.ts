import type { Data, Path } from '../data/types'
import type { Profile } from '../profile/profile'
import { hasSyncedStays, isSyncVisit, loadSyncedStays, SYNC_KV, SYNC_PLACE, toPVisit } from '../sync/local'
import { kv } from './db'
import { usePhotos } from '../photos/store'
import type { Parsed } from './parse'
import type { Job, Progress } from './worker'

export const STAGE_LABEL: Record<string, string> = { reading: 'Reading the file', parsing: 'Reading segments', cities: 'Naming cities', deriving: 'Working out trips and days', done: 'Printed' }

const CITIES = () => new URL(`${import.meta.env.BASE_URL}cities.json`, location.origin).href

function run(job: Job, onStage: (stage: string) => void): Promise<{ data: Data; parsed?: Parsed }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<Progress>) => {
      const p = e.data
      if (p.stage === 'error') { worker.terminate(); reject(new Error(p.message)); return }
      onStage(p.stage)
      if (p.stage === 'done') { worker.terminate(); resolve({ data: p.data as Data, parsed: p.parsed as Parsed | undefined }) }
    }
    worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message || 'The import failed')) }
    worker.postMessage(job)
  })
}

export type Runner = typeof run
/**
 * Parse a Timeline export off the main thread and keep the result (and its parsed form) in this browser. Stays pulled
 * from other devices are derived in alongside, so an import never pushes them out of view; the stored Parsed is the import alone.
 */
export async function ingestFile(file: File, profile: Profile, onStage: (stage: string) => void, runner: Runner = run): Promise<Data> {
  onStage('reading')
  const text = await file.text()
  let { data, parsed } = await runner({ text, name: file.name, citiesUrl: CITIES(), profile }, onStage)
  if (await hasSyncedStays().catch(() => false)) data = (await runner({ parsed: await withSyncedStays({ ...parsed!, paths: data.paths }), source: { file: data.meta.source_file, sha256: data.meta.source_sha256 }, citiesUrl: CITIES(), profile }, onStage)).data
  await saveRecord(data, parsed!)
  return data
}

/** Pre-baked records carry no Parsed; rebuild one. Memories are lost, so re-derived trips carry `memory: null`. */
export function parsedFromData(d: Data): Parsed {
  return { visits: d.visits.map((v) => ({ ...v, type: 'UNKNOWN' })), activities: d.activities.map((a) => ({ ...a })), paths: d.paths, memories: [], frequent_places: d.profile.frequent_places, frequent_trips: d.profile.frequent_trips, persona: d.profile.persona, report: d.meta.import_report }
}

/** Stays pulled from other devices join the parsed visits, named through `frequent_places`, so they are drawn like the rest. */
export async function withSyncedStays(parsed: Parsed): Promise<Parsed> {
  const stays = Object.values(await loadSyncedStays().catch(() => ({})))
  const visits = parsed.visits.filter((v) => !isSyncVisit(v)), frequent_places = parsed.frequent_places.filter((f) => !f.place_id.startsWith(SYNC_PLACE))
  if (!stays.length) return { ...parsed, visits, frequent_places }
  for (const s of stays) { const v = toPVisit(s); visits.push(v); frequent_places.push({ place_id: v.place_id, lat: s.lat, lng: s.lng, label: s.name || null }) }
  visits.sort((a, b) => a.start - b.start)
  return { ...parsed, visits, frequent_places }
}

/** Re-run derivation with a new profile; no re-parse. Imported records use their stored Parsed. */
export async function rederive(current: Data, profile: Profile, onStage: (stage: string) => void): Promise<Data> {
  const stored = await kv.get<Parsed>('parsed').catch(() => undefined)
  const parsed = await withSyncedStays(stored ? { ...stored, paths: current.paths } : parsedFromData(current))
  const { data } = await run({ parsed, source: { file: current.meta.source_file, sha256: current.meta.source_sha256 }, citiesUrl: CITIES(), profile }, onStage)
  if (stored) await kv.set('record', { ...data, paths: [] })
  return data
}

/** The record a device gets from sync alone, before any import: nothing of its own, under this source name. */
export const SYNC_SOURCE = 'sync'
export const emptyRecord = (): Data => ({
  visits: [], activities: [], strokes: [], paths: [], places: {}, daily: [], trips: [],
  profile: { home: { lat: 0, lng: 0 }, frequent_places: [], frequent_trips: [], persona: null },
  meta: { source_file: SYNC_SOURCE, source_sha256: SYNC_SOURCE, built_at: 0, range: [0, 0], import_report: { segments_total: 0, parsed: 0, skipped_by_reason: {} } },
})
/** With nothing imported here, the pulled stays are the record: derived from an empty base and kept like an import. Null when there are none. */
export async function recordFromSyncedStays(profile: Profile, onStage: (stage: string) => void): Promise<Data | null> {
  if (!(await hasSyncedStays().catch(() => false))) return null
  const base = emptyRecord()
  const data = await rederive(base, profile, onStage)
  await saveRecord(data, parsedFromData(base))
  return data
}

export async function saveRecord(data: Data, parsed: Parsed): Promise<void> {
  const { paths, ...rest } = data
  await kv.setAll([['record', { ...rest, paths: [] }], ['paths', paths], ['parsed', parsed]])
}
export const loadRecord = () => kv.get<Data>('record')
export const loadRecordPaths = async () => (await kv.get<Path[]>('paths')) ?? []
export const clearRecord = async () => { await kv.del('record'); await kv.del('paths'); await kv.del('parsed'); await kv.del('places'); await kv.del(SYNC_KV.stays); await kv.del(SYNC_KV.remote); await usePhotos.getState().clear() }
