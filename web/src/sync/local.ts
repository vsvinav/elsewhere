// What this device keeps about the synced record, all in the same IndexedDB store as the record itself: the stays pulled
// from other sources, and the bookkeeping that tells a push from a no-op and a pull from a repeat.
import { kv } from '../ingest/db'
import type { PVisit } from '../ingest/parse'
import type { Stay } from './wire'

export const SYNC_KV = { stays: 'sync:stays', remote: 'sync:remote', pushed: 'sync:pushed', profileTs: 'sync:profileTs', profileHash: 'sync:profileHash', lastTs: 'sync:lastTs' } as const
/** The marker a pulled stay carries through derivation, so it is drawn like any other visit but never pushed again. */
export const SYNC_VISIT_TYPE = 'SYNC'
export const SYNC_PLACE = 'sync:'

const record = async <T>(k: string): Promise<Record<string, T>> => { const v = await kv.get<unknown>(k); return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, T>) : {} }

export const loadSyncedStays = () => record<Stay>(SYNC_KV.stays)
/** Upsert by id; a stay already here with the same bytes changes nothing. Returns how many were new or changed. */
export async function upsertSyncedStays(stays: Stay[]): Promise<number> {
  const cur = await loadSyncedStays()
  let changed = 0
  for (const s of stays) { if (JSON.stringify(cur[s.id]) !== JSON.stringify(s)) { cur[s.id] = s; changed++ } }
  if (changed) await kv.set(SYNC_KV.stays, cur)
  return changed
}
export const hasSyncedStays = async () => Object.keys(await loadSyncedStays()).length > 0

export const loadRemoteTs = () => record<number>(SYNC_KV.remote)
export const saveRemoteTs = (m: Record<string, number>) => kv.set(SYNC_KV.remote, m)
export const loadPushed = () => record<string>(SYNC_KV.pushed)
export const savePushed = (m: Record<string, string>) => kv.set(SYNC_KV.pushed, m)
const num = async (k: string) => { const v = await kv.get<unknown>(k); return typeof v === 'number' ? v : null }
export const loadProfileMark = async () => ({ ts: await num(SYNC_KV.profileTs), hash: (await kv.get<unknown>(SYNC_KV.profileHash)) as string | undefined ?? null })
export const saveProfileMark = async (ts: number, hash: string) => { await kv.set(SYNC_KV.profileTs, ts); await kv.set(SYNC_KV.profileHash, hash) }
export const loadLastTs = () => num(SYNC_KV.lastTs)
export const saveLastTs = (ts: number) => kv.set(SYNC_KV.lastTs, ts)

/** Start fresh: the cloud bookkeeping goes so everything is pushed again under the new key; the pulled stays stay. */
export const clearSyncBookkeeping = () => Promise.all([kv.del(SYNC_KV.remote), kv.del(SYNC_KV.pushed), kv.del(SYNC_KV.profileTs), kv.del(SYNC_KV.profileHash), kv.del(SYNC_KV.lastTs)])

/** A pulled stay as the derivation pipeline reads it; the numeric id is the head of its hash. */
export const toPVisit = (s: Stay): PVisit => ({ id: parseInt(s.id.slice(0, 12), 16), start: s.start, end: s.end, tz: 0, place_id: SYNC_PLACE + s.id, lat: s.lat, lng: s.lng, type: SYNC_VISIT_TYPE, p: 1, lvl: 0 })
export const isSyncVisit = (v: { type: string }) => v.type === SYNC_VISIT_TYPE
