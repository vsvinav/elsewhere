import type { Data } from './types'

const FILES = ['visits', 'activities', 'paths', 'places', 'daily', 'trips', 'profile', 'meta'] as const

export class DataLoadError extends Error {
  constructor(public url: string, public status: string) {
    super(`Failed to load ${url}: ${status}`)
  }
}

export async function loadData(base = '/data'): Promise<Data> {
  const out: Record<string, unknown> = {}
  await Promise.all(FILES.map(async (f) => {
    const url = `${base}/${f}.json`
    let res: Response
    try { res = await fetch(url) } catch (e) { throw new DataLoadError(url, String(e)) }
    if (!res.ok) throw new DataLoadError(url, `${res.status} ${res.statusText}`)
    out[f] = await res.json()
  }))
  return out as unknown as Data
}
