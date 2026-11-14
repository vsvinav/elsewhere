/// <reference lib="webworker" />
import { parseTimeline } from './parse'
import { buildData, type Cities } from './derive'

export type Progress = { stage: 'reading' | 'parsing' | 'cities' | 'deriving' | 'done'; data?: unknown } | { stage: 'error'; message: string }

self.onmessage = async (e: MessageEvent<{ text: string; name: string; citiesUrl: string }>) => {
  const post = (p: Progress) => self.postMessage(p)
  try {
    const { text, name, citiesUrl } = e.data
    post({ stage: 'parsing' })
    const parsed = parseTimeline(text)
    if (!parsed.visits.length && !parsed.activities.length) throw new Error('No visits or activities found. Is this a Google Timeline export (semanticSegments)?')
    post({ stage: 'cities' })
    const [cities, digest] = await Promise.all([
      fetch(citiesUrl).then((r) => { if (!r.ok) throw new Error(`cities table ${r.status}`); return r.json() as Promise<Cities> }),
      crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
    ])
    post({ stage: 'deriving' })
    const sha = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    post({ stage: 'done', data: buildData(parsed, cities, { file: name, sha256: sha }) })
  } catch (err) { post({ stage: 'error', message: err instanceof Error ? err.message : String(err) }) }
}
