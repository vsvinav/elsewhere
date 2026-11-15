import { useSyncExternalStore } from 'react'
import { isHome } from '../analytics/geo'
import type { Place } from '../data/types'
import { kv } from './db'
import { settings } from './settings'
import { tally } from '../usage/usage'

/** What Places API (New) tells us about a place, kept without the key so it survives a key change. */
export interface Cached { name: string | null; address: string | null; types: string[]; primary_type: string | null; photo: string | null }
/** How far the lookups have got; `null` once there is nothing left to fetch. */
export type Progress = { done: number; total: number } | null
export interface Snapshot { cache: Record<string, Cached>; pending: number; total: number }

const CONCURRENCY = 4, SAVE_MS = 500

// One in-memory copy of the places cache: every writer lands here, so none can overwrite another's results.
let cache: Record<string, Cached> = {}
let loaded: Promise<void> | null = null
let saveTimer: ReturnType<typeof setTimeout> | undefined
const queue: string[] = []
const queued = new Set<string>()
let running = 0, pending = 0, total = 0, key = '', stopped = false
let snap: Snapshot = { cache, pending, total }
const subs = new Set<() => void>()
const errSubs = new Set<(e: Error) => void>()

const emit = () => { snap = { cache, pending, total }; subs.forEach((f) => f()) }
const load = () => (loaded ??= kv.get<Record<string, Cached>>('places').catch(() => undefined).then((c) => { cache = { ...(c ?? {}), ...cache }; emit() }))
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { kv.set('places', cache).catch(() => {}) }, SAVE_MS) }
const put = (id: string, c: Cached) => { cache = { ...cache, [id]: c }; save(); emit() }
/** Lookups are counted for the stamp as they are asked for; the burst's total resets once everything has landed. */
const ask = (n = 1) => { pending += n; total += n }
const settle = (n = 1) => { pending -= n; if (!pending) total = 0 }
const track = <T>(p: Promise<T>): Promise<T> => { ask(); emit(); return p.finally(() => { settle(); emit() }) }
/** Forget whatever is still waiting in the queue. */
const dropQueue = () => { settle(queue.length); queue.forEach((q) => queued.delete(q)); queue.length = 0 }
const canSpend = () => !!key && !stopped && settings.get().keyOk !== false

const photoUrl = (name: string, k: string) => `https://places.googleapis.com/v1/${name}/media?maxWidthPx=900&key=${k}`

/** Lays cached names, addresses, types and photo URLs over the record's places. */
export function apply(places: Record<string, Place>, c: Record<string, Cached>, k: string): Record<string, Place> {
  const out = { ...places }
  for (const id in c) {
    const x = c[id], p = out[id]
    if (!p) continue
    out[id] = { ...p, name: p.name ?? x.name, address: p.address ?? x.address, types: p.types?.length ? p.types : x.types, primary_type: p.primary_type ?? x.primary_type, photo: x.photo && k ? photoUrl(x.photo, k) : p.photo ?? null }
  }
  return out
}

export async function lookup(id: string, k: string): Promise<Cached> {
  tally('details')
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, { headers: { 'X-Goog-Api-Key': k, 'X-Goog-FieldMask': 'displayName,formattedAddress,types,primaryType,photos' } })
  if (res.status === 404 || res.status === 400) return { name: null, address: null, types: [], primary_type: null, photo: null }
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: { message?: string } } | null
    throw new Error(body?.error?.message?.split(' of service')[0] ?? `Places API ${res.status}`)
  }
  const j = await res.json() as { displayName?: { text: string }; formattedAddress?: string; types?: string[]; primaryType?: string; photos?: { name: string }[] }
  return { name: j.displayName?.text ?? null, address: j.formattedAddress ?? null, types: j.types ?? [], primary_type: j.primaryType ?? null, photo: j.photos?.[0]?.name ?? null }
}

function pump() {
  while (running < CONCURRENCY && queue.length && canSpend()) {
    const id = queue.shift()!
    running++
    const k = key
    lookup(id, k).then((c) => put(id, c), (e: Error) => { stopped = true; dropQueue(); errSubs.forEach((f) => f(e)) })
      .finally(() => { running--; queued.delete(id); settle(); emit(); pump() })
  }
}

/**
 * Ask for these places to be named and photographed, when the visitor's key allows it. Cached ids, home,
 * places already named with a photo and ids already waiting are skipped. Results reach every subscriber.
 */
export function need(ids: string[], places?: Record<string, Place>): void {
  if (!canSpend()) return
  let added = 0
  for (const id of ids) {
    if (id in cache || queued.has(id)) continue
    const p = places?.[id]
    if (places && (!p || isHome(p) || (p.name && p.photo))) continue
    queued.add(id); queue.push(id); added++
  }
  if (!added) return
  ask(added); emit()
  load().then(() => {
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i] in cache) { queued.delete(queue.splice(i, 1)[0]); settle() }
    emit(); pump()
  })
}

/** The key lookups pay with (empty: none). A new key clears a stopped pool and picks up whatever is still waiting. */
export function setKey(k: string): void {
  key = k; stopped = false
  if (!canSpend()) { dropQueue(); emit() } else pump()
}

export const onError = (f: (e: Error) => void) => { errSubs.add(f); return () => { errSubs.delete(f) } }
export const subscribe = (f: () => void) => { subs.add(f); load(); return () => { subs.delete(f) } }
export const snapshot = () => snap
export const usePlaces = () => useSyncExternalStore(subscribe, snapshot)
export function useNaming(): Progress {
  const { pending: p, total: t } = usePlaces()
  return t ? { done: t - p, total: t } : null
}
/** Tests only: forget everything. */
export function reset(): void {
  cache = {}; loaded = null; clearTimeout(saveTimer); queue.length = 0; queued.clear(); running = 0; pending = 0; total = 0; key = ''; stopped = false; subs.clear(); errSubs.clear(); emit()
}

const ADDRESS_TYPES = new Set(['street_address', 'premise', 'subpremise', 'route', 'plus_code', 'postal_code', 'locality', 'sublocality', 'sublocality_level_1', 'neighborhood', 'political', 'geocode', 'intersection'])
/** Is this a proper name ("Savoy Apartments"), not an address Google gave back as the display name? */
export function properName(c: { name: string | null; types?: string[]; primary_type?: string | null }): boolean {
  if (!c.name || /^\d/.test(c.name.trim())) return false
  if (c.primary_type && !ADDRESS_TYPES.has(c.primary_type)) return true
  return !!c.types?.some((t) => !ADDRESS_TYPES.has(t) && t !== 'point_of_interest' && t !== 'establishment')
}

/** The best name for a cluster of place ids; only pays for lookups that are not cached yet, at most `max` of them. */
export async function clusterName(ids: string[], places: Record<string, Place>, k: string, max = 3): Promise<string | null> {
  await load()
  const known = (id: string): Cached | undefined => {
    const p = places[id]
    return id in cache ? cache[id] : p?.name ? { name: p.name, address: p.address ?? null, types: p.types ?? [], primary_type: p.primary_type ?? null, photo: p.photo ?? null } : undefined
  }
  let got = ids.map(known)
  if (got.some((c) => c && properName(c))) return got.find((c) => c && properName(c))!.name
  if (k) {
    let paid = 0
    for (let i = 0; i < ids.length && paid < max; i++) {
      if (got[i]) continue
      try { put(ids[i], await track(lookup(ids[i], k))); paid++ } catch { break }
      if (properName(cache[ids[i]])) break
    }
    got = ids.map(known)
  }
  const named = got.filter((c): c is Cached => !!c?.name)
  return named.find(properName)?.name ?? null
}
