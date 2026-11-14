import type { Data, Path } from './types'

const FILES = ['visits', 'activities', 'strokes', 'places', 'daily', 'trips', 'profile', 'meta'] as const

export class DataLoadError extends Error {
  constructor(public url: string, public status: string) {
    super(`Failed to load ${url}: ${status}`)
  }
}

async function fetchJson(url: string): Promise<unknown> {
  let res: Response
  try { res = await fetch(url) } catch (e) { throw new DataLoadError(url, String(e)) }
  if (!res.ok) throw new DataLoadError(url, `${res.status} ${res.statusText}`)
  return res.json()
}

export async function loadData(base = '/data'): Promise<Data> {
  const out: Record<string, unknown> = { paths: [] }
  await Promise.all(FILES.map(async (f) => { out[f] = await fetchJson(`${base}/${f}.json`) }))
  return out as unknown as Data
}

/** The full GPS record (the largest file); only the map needs it. */
export function loadPaths(base = '/data'): Promise<Path[]> {
  return fetchJson(`${base}/paths.json`) as Promise<Path[]>
}
