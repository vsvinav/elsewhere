import type { Data, Path } from '../data/types'
import type { Profile } from '../profile/profile'
import { kv } from './db'
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

/** Parse a Timeline export off the main thread and keep the result (and its parsed form) in this browser. */
export async function ingestFile(file: File, profile: Profile, onStage: (stage: string) => void): Promise<Data> {
  onStage('reading')
  const text = await file.text()
  const { data, parsed } = await run({ text, name: file.name, citiesUrl: CITIES(), profile }, onStage)
  await saveRecord(data, parsed!)
  return data
}

/** Pre-baked records carry no Parsed; rebuild one. Memories are lost, so re-derived trips carry `memory: null`. */
export function parsedFromData(d: Data): Parsed {
  return { visits: d.visits.map((v) => ({ ...v, type: 'UNKNOWN' })), activities: d.activities.map((a) => ({ ...a })), paths: d.paths, memories: [], frequent_places: d.profile.frequent_places, frequent_trips: d.profile.frequent_trips, persona: d.profile.persona, report: d.meta.import_report }
}

/** Re-run derivation with a new profile; no re-parse. Imported records use their stored Parsed. */
export async function rederive(current: Data, profile: Profile, onStage: (stage: string) => void): Promise<Data> {
  const stored = await kv.get<Parsed>('parsed').catch(() => undefined)
  const parsed = stored ? { ...stored, paths: current.paths } : parsedFromData(current)
  const { data } = await run({ parsed, source: { file: current.meta.source_file, sha256: current.meta.source_sha256 }, citiesUrl: CITIES(), profile }, onStage)
  if (stored) await kv.set('record', { ...data, paths: [] })
  return data
}

export async function saveRecord(data: Data, parsed: Parsed): Promise<void> {
  const { paths, ...rest } = data
  await kv.setAll([['record', { ...rest, paths: [] }], ['paths', paths], ['parsed', parsed]])
}
export const loadRecord = () => kv.get<Data>('record')
export const loadRecordPaths = async () => (await kv.get<Path[]>('paths')) ?? []
export const clearRecord = async () => { await kv.del('record'); await kv.del('paths'); await kv.del('parsed'); await kv.del('places') }
