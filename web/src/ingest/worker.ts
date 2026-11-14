/// <reference lib="webworker" />
import { parseTimeline, type Parsed } from './parse'
import { buildData, type Cities } from './derive'
import type { Profile } from '../profile/profile'

export type Progress = { stage: 'reading' | 'parsing' | 'cities' | 'deriving' | 'done'; data?: unknown; parsed?: unknown } | { stage: 'error'; message: string }
export type Job =
  | { text: string; name: string; citiesUrl: string; profile: Profile }
  | { parsed: Parsed; source: { file: string; sha256: string }; citiesUrl: string; profile: Profile }

self.onmessage = async (e: MessageEvent<Job>) => {
  const post = (p: Progress) => self.postMessage(p)
  try {
    const job = e.data
    const cities = fetch(job.citiesUrl).then((r) => { if (!r.ok) throw new Error(`cities table ${r.status}`); return r.json() as Promise<Cities> })
    if ('parsed' in job) {
      post({ stage: 'deriving' })
      post({ stage: 'done', data: buildData(job.parsed, await cities, job.source, job.profile) })
      return
    }
    post({ stage: 'parsing' })
    const parsed = parseTimeline(job.text)
    if (!parsed.visits.length && !parsed.activities.length) throw new Error('No visits or activities found. Is this a Google Timeline export (semanticSegments)?')
    post({ stage: 'cities' })
    const [c, digest] = await Promise.all([cities, crypto.subtle.digest('SHA-256', new TextEncoder().encode(job.text))])
    post({ stage: 'deriving' })
    const sha = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    const { paths, ...rest } = parsed
    post({ stage: 'done', data: buildData(parsed, c, { file: job.name, sha256: sha }, job.profile), parsed: { ...rest, paths: [] } })
  } catch (err) { post({ stage: 'error', message: err instanceof Error ? err.message : String(err) }) }
}
