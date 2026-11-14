import type { Data, Place } from '../data/types'
import { kv } from './db'

/** What Places API (New) tells us about a place, kept without the key so it survives a key change. */
interface Cached { name: string | null; address: string | null; types: string[]; primary_type: string | null; photo: string | null }
const LIMIT = 160, CONCURRENCY = 4

const photoUrl = (name: string, key: string) => `https://places.googleapis.com/v1/${name}/media?maxWidthPx=900&key=${key}`

function apply(places: Record<string, Place>, cache: Record<string, Cached>, key: string): Record<string, Place> {
  const out = { ...places }
  for (const id in cache) {
    const c = cache[id], p = out[id]
    if (!p) continue
    out[id] = { ...p, name: p.name ?? c.name, address: p.address ?? c.address, types: p.types?.length ? p.types : c.types, primary_type: p.primary_type ?? c.primary_type, photo: c.photo && key ? photoUrl(c.photo, key) : p.photo ?? null }
  }
  return out
}

/** Which places deserve a lookup: the most visited ones that still lack a name or a photo, home excluded. */
function wanted(places: Record<string, Place>, cache: Record<string, Cached>): string[] {
  return Object.entries(places)
    .filter(([id, p]) => p.semantic_type !== 'INFERRED_HOME' && !(id in cache) && (!p.name || !p.photo))
    .sort((a, b) => b[1].n_visits - a[1].n_visits).slice(0, LIMIT).map(([id]) => id)
}

async function lookup(id: string, key: string): Promise<Cached> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, { headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'displayName,formattedAddress,types,primaryType,photos' } })
  if (res.status === 404 || res.status === 400) return { name: null, address: null, types: [], primary_type: null, photo: null }
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: { message?: string } } | null
    throw new Error(body?.error?.message?.split(' of service')[0] ?? `Places API ${res.status}`)
  }
  const j = await res.json() as { displayName?: { text: string }; formattedAddress?: string; types?: string[]; primaryType?: string; photos?: { name: string }[] }
  return { name: j.displayName?.text ?? null, address: j.formattedAddress ?? null, types: j.types ?? [], primary_type: j.primaryType ?? null, photo: j.photos?.[0]?.name ?? null }
}

/**
 * Names and photographs places with the visitor's key. Calls `onPlaces` first with what is cached,
 * then again as lookups land. Returns a stop function.
 */
export function enrichPlaces(data: Data, key: string, onPlaces: (p: Record<string, Place>) => void, onError: (e: Error) => void): () => void {
  let stopped = false
  ;(async () => {
    const cache = (await kv.get<Record<string, Cached>>('places').catch(() => undefined)) ?? {}
    onPlaces(apply(data.places, cache, key))
    if (!key) return
    const queue = wanted(data.places, cache)
    if (!queue.length) return
    let landed = 0
    const flush = async () => { await kv.set('places', cache); onPlaces(apply(data.places, cache, key)) }
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length && !stopped) {
        const id = queue.shift()!
        try { cache[id] = await lookup(id, key) } catch (e) { stopped = true; onError(e as Error); return }
        if (++landed % 12 === 0) await flush()
      }
    }))
    await flush()
  })()
  return () => { stopped = true }
}
