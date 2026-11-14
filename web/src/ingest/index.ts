import type { Data, Path } from '../data/types'
import { kv } from './db'
import type { Progress } from './worker'

export const STAGE_LABEL: Record<string, string> = { reading: 'Reading the file', parsing: 'Reading segments', cities: 'Naming cities', deriving: 'Working out trips and days', done: 'Printed' }

/** Parse a Timeline export off the main thread and keep the result in this browser. */
export function ingestFile(file: File, onStage: (stage: string) => void): Promise<Data> {
  return new Promise((resolve, reject) => {
    onStage('reading')
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = async (e: MessageEvent<Progress>) => {
      const p = e.data
      if (p.stage === 'error') { worker.terminate(); reject(new Error(p.message)); return }
      onStage(p.stage)
      if (p.stage === 'done') {
        worker.terminate()
        const data = p.data as Data
        try { await saveRecord(data) } catch (err) { reject(err); return }
        resolve(data)
      }
    }
    worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message || 'The import failed')) }
    file.text().then((text) => worker.postMessage({ text, name: file.name, citiesUrl: new URL('/cities.json', location.origin).href }), reject)
  })
}

export async function saveRecord(data: Data): Promise<void> {
  const { paths, ...rest } = data
  await kv.setAll([['record', { ...rest, paths: [] }], ['paths', paths]])
}
export const loadRecord = () => kv.get<Data>('record')
export const loadRecordPaths = async () => (await kv.get<Path[]>('paths')) ?? []
export const clearRecord = async () => { await kv.del('record'); await kv.del('paths'); await kv.del('places') }
