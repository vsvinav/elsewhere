// Push what this device knows, pull what the others do. Everything crosses the service sealed under the Drive key;
// stays are immutable, so a pull only ever adds, and the profile is last-write-wins on its timestamp.
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { AccountError, api, type AccountClient } from '../account/client'
import { deleteKey, fetchOrCreateKey, loadLocalKey } from '../account/driveKey'
import { driveToken } from '../account/google'
import { useAccount } from '../account/store'
import { markUploaded, uploadVault } from '../account/sync'
import type { Data } from '../data/types'
import { profile as profileStore, type Home, type Profile } from '../profile/profile'
import { clearSyncBookkeeping, isSyncVisit, loadLastTs, loadProfileMark, loadPushed, loadRemoteTs, saveLastTs, saveProfileMark, savePushed, saveRemoteTs, upsertSyncedStays } from './local'
import { useSync, type SyncErrorKind } from './store'
import { chunkKey, importSource, monthOf, openBlob, PROFILE_KEY, sealBlob, stayId, SYNC_KEY_RE, type HomeWire, type MonthChunk, type ProfileWire, type Stay, type SyncBlob } from './wire'

export interface EngineDeps {
  client?: () => AccountClient
  now?: () => number
  /** The record on this device, or null when there is none to push. */
  record?: () => Data | null
  key?: () => Promise<Uint8Array | null>
  drive?: () => Promise<string>
}
const defaults: Required<EngineDeps> = { client: () => api(), now: Date.now, record: () => null, key: loadLocalKey, drive: driveToken }

const hashOf = (x: unknown) => bytesToHex(sha256(utf8ToBytes(JSON.stringify(x))))
const NAME_MAX = 200

/** The month chunks of this device's own import, keyed as the service stores them. Pulled stays are left out. */
export function localChunks(d: Data): Map<string, MonthChunk> {
  const source = importSource(d.meta.source_sha256)
  const out = new Map<string, MonthChunk>()
  for (const v of d.visits) {
    if (isSyncVisit(v)) continue
    const pl = d.places[v.place_id]
    const name = (pl?.name ?? pl?.label ?? pl?.city ?? '').slice(0, NAME_MAX)
    const key = chunkKey(source, monthOf(v.start))
    const chunk = out.get(key) ?? { v: 1, stays: [] }
    chunk.stays.push({ id: stayId(source, v.start), lat: v.lat, lng: v.lng, name, start: v.start, end: v.end })
    out.set(key, chunk)
  }
  for (const c of out.values()) c.stays.sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1))
  return out
}

const dateOf = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10)
const secOf = (date: string | null) => (date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) / 1000 : null)
export function profileToWire(p: Profile, ts: number): ProfileWire {
  const homes: HomeWire[] = p.homes.map((h) => ({ name: h.name ?? h.city, lat: h.lat, lng: h.lng, from: h.from ? dateOf(h.from) : null, to: h.to ? dateOf(h.to) : null, city: h.city, cc: h.cc }))
  return { v: 1, ts, name: p.name, homes, units: p.units }
}
/** Works are not on the wire; the local ones stay. */
export function profileFromWire(w: ProfileWire, local: Profile | null): Profile {
  const homes: Home[] = w.homes.map((h) => ({ lat: h.lat, lng: h.lng, city: h.city ?? h.name, cc: h.cc ?? '', from: secOf(h.from) ?? 0, to: secOf(h.to), name: h.name }))
  return { name: w.name, units: w.units === 'mi' ? 'mi' : 'km', homes, works: local?.works ?? [] }
}

const fin = (x: unknown, lo: number, hi: number): x is number => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi
const str = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max
const isStay = (s: unknown): s is Stay => {
  const x = s as Partial<Stay> | null
  return !!x && typeof x === 'object' && typeof x.id === 'string' && /^[0-9a-f]{64}$/.test(x.id) && fin(x.lat, -90, 90) && fin(x.lng, -180, 180) && str(x.name, NAME_MAX) && Number.isSafeInteger(x.start) && Number.isSafeInteger(x.end) && x.start! >= 0 && x.end! >= x.start!
}
const isHome = (h: unknown): h is HomeWire => {
  const x = h as Partial<HomeWire> | null
  return !!x && typeof x === 'object' && str(x.name, NAME_MAX) && fin(x.lat, -90, 90) && fin(x.lng, -180, 180) && (x.from === null || str(x.from, 10)) && (x.to === null || str(x.to, 10)) && (x.city === undefined || str(x.city, NAME_MAX)) && (x.cc === undefined || str(x.cc, 2))
}
const isProfileWire = (p: unknown): p is ProfileWire => {
  const x = p as Partial<ProfileWire> | null
  return !!x && typeof x === 'object' && x.v === 1 && Number.isSafeInteger(x.ts) && (x.name === null || str(x.name, NAME_MAX)) && Array.isArray(x.homes) && x.homes.every(isHome) && (x.units === 'km' || x.units === 'mi')
}
const isChunk = (c: unknown): c is MonthChunk => { const x = c as Partial<MonthChunk> | null; return !!x && typeof x === 'object' && x.v === 1 && Array.isArray(x.stays) && x.stays.every(isStay) }

export class SyncLockedError extends Error { constructor() { super('locked'); this.name = 'SyncLockedError' } }

/** Chunks whose bytes differ from the last push go up with a fresh `ts`; the profile too when it changed here. */
export async function push(key: Uint8Array, deps: EngineDeps = {}): Promise<void> {
  const d = { ...defaults, ...deps }
  const client = d.client()
  const [pushed, remote] = await Promise.all([loadPushed(), loadRemoteTs()])
  const rec = d.record()
  if (rec) {
    for (const [name, chunk] of localChunks(rec)) {
      const h = hashOf(chunk)
      if (pushed[name] === h) continue
      const ts = d.now()
      await client.putSync(name, sealBlob(key, name, chunk, ts))
      pushed[name] = h; remote[name] = ts
    }
  }
  const prof = profileStore.get()
  if (prof) {
    const mark = await loadProfileMark()
    const h = hashOf([prof.name, prof.units, prof.homes])
    if (mark.hash !== h) {
      const ts = d.now()
      try {
        await client.putSync(PROFILE_KEY, sealBlob(key, PROFILE_KEY, profileToWire(prof, ts), ts))
        await saveProfileMark(ts, h); remote[PROFILE_KEY] = ts
      } catch (e) { if (!(e instanceof AccountError && e.status === 409)) throw e }
    }
  }
  await savePushed(pushed); await saveRemoteTs(remote)
}

/** Everything newer than what this device has seen comes down; stays are added by id, the profile only if newer. */
export async function pull(key: Uint8Array, deps: EngineDeps = {}): Promise<void> {
  const d = { ...defaults, ...deps }
  const client = d.client()
  const remote = await loadRemoteTs()
  const rec = d.record()
  const own = rec ? importSource(rec.meta.source_sha256) : null
  const list = await client.listSync()
  let changed = 0
  for (const e of list) {
    if (!SYNC_KEY_RE.test(e.key) || !Number.isSafeInteger(e.ts) || (remote[e.key] ?? -1) >= e.ts) continue
    const blob = await client.getSync(e.key)
    if (!blob) continue
    let plain: unknown
    try { plain = openBlob(key, e.key, blob) } catch { throw new SyncLockedError() }
    if (e.key === PROFILE_KEY) {
      if (isProfileWire(plain)) {
        const mark = await loadProfileMark()
        if ((mark.ts ?? -1) < plain.ts) {
          const next = profileFromWire(plain, profileStore.get())
          profileStore.set(next)
          await saveProfileMark(plain.ts, hashOf([next.name, next.units, next.homes]))
        }
      }
    } else if (!own || !e.key.startsWith(`${own}:`)) {
      if (isChunk(plain)) changed += await upsertSyncedStays(plain.stays)
    }
    remote[e.key] = blob.ts
  }
  await saveRemoteTs(remote)
  if (changed) useSync.getState().bumpStays()
}

const kindOf = (e: unknown): SyncErrorKind => (e instanceof SyncLockedError ? 'locked' : e instanceof AccountError && e.status === 0 ? 'network' : e instanceof AccountError ? 'http' : 'network')

let running: Promise<void> | null = null
/** One full round, pull then push; a second call while one runs waits for it. Off without a session and a key. */
export function syncNow(deps: EngineDeps = {}): Promise<void> {
  return (running ??= run(deps).finally(() => { running = null }))
}
async function run(deps: EngineDeps): Promise<void> {
  const d = { ...defaults, ...deps }
  const s = useSync.getState()
  const a = useAccount.getState()
  const key = a.session && a.driveKeyed ? await d.key() : null
  if (!key) { s.setStatus({ kind: 'off' }); return }
  const lastTs = await loadLastTs()
  s.setStatus({ kind: 'syncing' })
  try {
    await pull(key, d)
    await push(key, d)
    const ts = d.now()
    await saveLastTs(ts)
    useSync.getState().setStatus({ kind: 'idle', lastTs: ts })
  } catch (e) { useSync.getState().setStatus({ kind: 'error', error: kindOf(e), lastTs }) }
}

/** The status a device shows before its first round, from what it remembers. */
export async function loadSyncStatus(deps: EngineDeps = {}): Promise<void> {
  const d = { ...defaults, ...deps }
  const a = useAccount.getState()
  const key = a.session && a.driveKeyed ? await d.key() : null
  useSync.getState().setStatus(key ? { kind: 'idle', lastTs: await loadLastTs() } : { kind: 'off' })
}

/**
 * Start fresh: the blobs on the service and the key in Drive go. A new key is made in their place, the vault is re-sealed
 * under it and this device's record is pushed again, so the account keeps working and other devices re-key on their next
 * Google sign-in. Nothing on this device is removed.
 */
export async function startFresh(deps: EngineDeps = {}): Promise<void> {
  const d = { ...defaults, ...deps }
  const client = d.client()
  useSync.getState().setStatus({ kind: 'syncing' })
  try {
    const token = await d.drive()
    await client.deleteSync()
    await deleteKey(token)
    await clearSyncBookkeeping()
    await fetchOrCreateKey(token)
    markUploaded(null)
    await uploadVault({ client: () => client })
  } catch (e) { useSync.getState().setStatus({ kind: 'error', error: kindOf(e), lastTs: null }); return }
  await syncNow(deps)
}
