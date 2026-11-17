import { beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'

const db = vi.hoisted(() => ({ store: new Map<string, unknown>() }))
vi.mock('../ingest/db', () => ({ kv: { get: async (k: string) => db.store.get(k), set: async (k: string, v: unknown) => { db.store.set(k, v) }, del: async (k: string) => { db.store.delete(k) } } }))
vi.hoisted(() => {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) })
})
const drive = vi.hoisted(() => ({ deleted: 0, created: 0 }))
vi.mock('../account/driveKey', () => ({
  loadLocalKey: async () => db.store.get('sync:key') ?? null,
  deleteKey: async () => { drive.deleted++ },
  fetchOrCreateKey: async () => { drive.created++; const k = new Uint8Array(32).fill(9); db.store.set('sync:key', k); return k },
}))

import { AccountError, type AccountClient } from '../account/client'
import { resetAccountForTest, useAccount } from '../account/store'
import type { Data, Visit } from '../data/types'
import { withSyncedStays } from '../ingest'
import type { Parsed } from '../ingest/parse'
import { profile } from '../profile/profile'
import { localChunks, loadSyncStatus, profileFromWire, profileToWire, pull, push, startFresh, syncNow } from './engine'
import { loadSyncedStays, SYNC_KV, toPVisit, upsertSyncedStays } from './local'
import { resetSyncForTest, useSync } from './store'
import { importSource, openBlob, PROFILE_KEY, sealBlob, stayId, type SyncBlob } from './wire'

const KEY = new Uint8Array(32).fill(7)
const OTHER = new Uint8Array(32).fill(8)
const SHA = 'ab12cd34ef56' + '0'.repeat(52)
const SRC = importSource(SHA)

const visit = (id: number, start: number, end: number, place_id = 'p1'): Visit => ({ id, start, end, tz: 0, place_id, lat: 48.85, lng: 2.35, type: 'VISIT', p: 1, lvl: 0 })
const data = (visits: Visit[]): Data => ({
  visits, activities: [], strokes: [], paths: [], daily: [], trips: [],
  places: { p1: { lat: 48.85, lng: 2.35, label: 'Paris flat', role: null, city: 'Paris', country_code: 'FR', n_visits: 1, total_hours: 1, first_ts: 0, last_ts: 0, name: 'Café' }, p2: { lat: 1, lng: 1, label: null, role: null, city: 'Lyon', country_code: 'FR', n_visits: 1, total_hours: 1, first_ts: 0, last_ts: 0, name: null } },
  profile: { home: { lat: 0, lng: 0 }, homes: [], works: [], frequent_places: [], frequent_trips: [], persona: null },
  meta: { source_file: 'x.zip', source_sha256: SHA, built_at: 0 } as Data['meta'],
})

/** A fake service: blobs by key with the worker's LWW rule. */
function fakeClient(fail?: () => Error | null) {
  const blobs = new Map<string, SyncBlob>()
  const calls: string[] = []
  const c: AccountClient = {
    start: async () => ({}), finish: async () => { throw new Error() }, google: async () => { throw new Error() }, peek: async () => ({ email: '' }), me: async () => ({ id: 'acct_1', email: 'a@b.co', created: 1, hasVault: true }), logout: async () => {},
    putVault: async () => { calls.push('putVault') }, getVault: async () => null, deleteMe: async () => {},
    listSync: async () => { const e = fail?.(); if (e) throw e; calls.push('list'); return [...blobs].map(([key, b]) => ({ key, ts: b.ts, size: JSON.stringify(b).length })) },
    getSync: async (key) => { calls.push(`get ${key}`); return blobs.get(key) ?? null },
    putSync: async (key, b) => { calls.push(`put ${key}`); const cur = blobs.get(key); if (cur && cur.ts > b.ts) throw new AccountError(409, 'stale'); blobs.set(key, b) },
    deleteSync: async () => { calls.push('deleteAll'); blobs.clear() },
  }
  return { c, blobs, calls }
}

beforeEach(async () => {
  db.store.clear(); resetAccountForTest(); resetSyncForTest(); profile.set(null); drive.deleted = drive.created = 0
  await useAccount.getState().setSession({ session: 'f'.repeat(64), id: 'acct_1', email: 'a@b.co' })
  await useAccount.getState().setDriveKeyed(true)
  db.store.set('sync:key', KEY)
})

describe('month chunks', () => {
  it('buckets by UTC month of the start, across a year boundary, with the place name and a stable id', () => {
    const dec = Date.UTC(2025, 11, 31, 23, 30) / 1000, jan = Date.UTC(2026, 0, 1, 0, 30) / 1000
    const chunks = localChunks(data([visit(2, jan, jan + 600, 'p2'), visit(1, dec, jan + 3600)]))
    expect([...chunks.keys()]).toEqual([`${SRC}:2026-01`, `${SRC}:2025-12`])
    expect(chunks.get(`${SRC}:2025-12`)!.stays).toEqual([{ id: stayId(SRC, dec), lat: 48.85, lng: 2.35, name: 'Café', start: dec, end: jan + 3600 }])
    expect(chunks.get(`${SRC}:2026-01`)!.stays[0].name).toBe('Lyon')
  })
  it('leaves pulled stays out of what is pushed', () => {
    const chunks = localChunks(data([toPVisit({ id: 'a'.repeat(64), lat: 1, lng: 1, name: 'x', start: 1700000000, end: 1700003600 }) as Visit]))
    expect(chunks.size).toBe(0)
  })
})

describe('pulled stays in the record', () => {
  it('join the parsed visits in time order, named through frequent places, and are not added twice', async () => {
    const stay = { id: 'a'.repeat(64), lat: 1, lng: 2, name: 'Rome', start: 50, end: 60 }
    await upsertSyncedStays([stay])
    const parsed: Parsed = { visits: [visit(1, 10, 20), visit(2, 100, 120)], activities: [], paths: [], memories: [], frequent_places: [], frequent_trips: [], persona: null, report: { segments_total: 0, parsed: 0, skipped_by_reason: {} } }
    const once = await withSyncedStays(parsed)
    const twice = await withSyncedStays(once)
    expect(twice.visits.map((v) => v.start)).toEqual([10, 50, 100])
    expect(twice.visits[1]).toMatchObject({ type: 'SYNC', place_id: `sync:${stay.id}`, lat: 1, lng: 2 })
    expect(twice.frequent_places).toEqual([{ place_id: `sync:${stay.id}`, lat: 1, lng: 2, label: 'Rome' }])
    expect(localChunks(data(twice.visits as Visit[])).get(`${SRC}:1970-01`)!.stays).toHaveLength(2)
  })
})

describe('profile on the wire', () => {
  it('maps homes both ways, with dates as yyyy-mm-dd and works kept local', () => {
    const local = { name: 'Ada', units: 'mi' as const, homes: [{ lat: 1, lng: 2, city: 'Paris', cc: 'FR', from: Date.UTC(2020, 0, 15) / 1000, to: null }], works: [{ lat: 0, lng: 0, place_id: 'w1', from: 0, to: null }] }
    const w = profileToWire(local, 42)
    expect(w).toEqual({ v: 1, ts: 42, name: 'Ada', units: 'mi', homes: [{ name: 'Paris', lat: 1, lng: 2, from: '2020-01-15', to: null, city: 'Paris', cc: 'FR' }] })
    const back = profileFromWire(w, local)
    expect(back.homes[0]).toMatchObject({ lat: 1, lng: 2, city: 'Paris', cc: 'FR', from: Date.UTC(2020, 0, 15) / 1000, to: null })
    expect(back.works).toEqual(local.works)
    expect(profileFromWire({ v: 1, ts: 1, name: null, units: 'km', homes: [{ name: 'Rome', lat: 1, lng: 2, from: null, to: null }] }, null).homes[0]).toMatchObject({ city: 'Rome', cc: '', from: 0 })
  })
})

describe('push and pull', () => {
  const t = 1700000000
  it('pushes changed chunks and the profile once, then nothing until they change', async () => {
    const f = fakeClient()
    profile.set({ name: 'Ada', units: 'km', homes: [], works: [] })
    const rec = data([visit(1, t, t + 60)])
    await push(KEY, { client: () => f.c, record: () => rec, now: () => 1000 })
    expect(f.calls).toEqual([`put ${SRC}:2023-11`, 'put profile'])
    expect(openBlob(KEY, `${SRC}:2023-11`, f.blobs.get(`${SRC}:2023-11`)!)).toEqual({ v: 1, stays: [{ id: stayId(SRC, t), lat: 48.85, lng: 2.35, name: 'Café', start: t, end: t + 60 }] })
    f.calls.length = 0
    await push(KEY, { client: () => f.c, record: () => rec, now: () => 2000 })
    expect(f.calls).toEqual([])
    profile.set({ name: 'Ada L.', units: 'km', homes: [], works: [] })
    await push(KEY, { client: () => f.c, record: () => rec, now: () => 3000 })
    expect(f.calls).toEqual(['put profile'])
    expect(f.blobs.get(PROFILE_KEY)!.ts).toBe(3000)
  })
  it('pulls other sources, merges stays by id idempotently and never pushes them back', async () => {
    const f = fakeClient()
    const stay = { id: stayId('d_phone', t), lat: 1, lng: 2, name: 'Rome', start: t, end: t + 60 }
    f.blobs.set(`d_phone:2023-11`, sealBlob(KEY, 'd_phone:2023-11', { v: 1, stays: [stay] }, 500))
    f.blobs.set(`${SRC}:2023-11`, sealBlob(KEY, `${SRC}:2023-11`, { v: 1, stays: [{ ...stay, id: 'b'.repeat(64) }] }, 500))
    const deps = { client: () => f.c, record: () => data([visit(1, t, t + 60)]), now: () => 1000 }
    await pull(KEY, deps)
    expect(await loadSyncedStays()).toEqual({ [stay.id]: stay })
    expect(useSync.getState().staysVersion).toBe(1)
    f.calls.length = 0
    await pull(KEY, deps)
    expect(f.calls).toEqual(['list'])
    expect(useSync.getState().staysVersion).toBe(1)
    expect(await upsertSyncedStays([stay, { ...stay, name: 'Roma' }])).toBe(1)
    expect(Object.keys(await loadSyncedStays())).toHaveLength(1)
    await push(KEY, deps)
    expect(f.calls.filter((x) => x.startsWith('put d_phone'))).toEqual([])
  })
  it('applies the profile only when the remote one is newer, and keeps the local one on a 409', async () => {
    const f = fakeClient()
    profile.set({ name: 'Local', units: 'km', homes: [], works: [] })
    f.blobs.set(PROFILE_KEY, sealBlob(KEY, PROFILE_KEY, { v: 1, ts: 5000, name: 'Remote', homes: [], units: 'mi' }, 5000))
    const deps = { client: () => f.c, record: () => null, now: () => 1000 }
    await pull(KEY, deps)
    expect(profile.get()).toMatchObject({ name: 'Remote', units: 'mi' })
    await push(KEY, deps)
    expect(f.blobs.get(PROFILE_KEY)!.ts).toBe(5000)
    f.blobs.set(PROFILE_KEY, sealBlob(KEY, PROFILE_KEY, { v: 1, ts: 4000, name: 'Older', homes: [], units: 'km' }, 6000))
    await pull(KEY, deps)
    expect(profile.get()!.name).toBe('Remote')
    profile.set({ name: 'Newer here', units: 'km', homes: [], works: [] })
    f.blobs.set(PROFILE_KEY, sealBlob(KEY, PROFILE_KEY, { v: 1, ts: 9000, name: 'Winner', homes: [], units: 'km' }, 9000))
    await push(KEY, { ...deps, now: () => 7000 })
    expect(f.blobs.get(PROFILE_KEY)!.ts).toBe(9000)
    expect(profile.get()!.name).toBe('Newer here')
  })
  it('skips blobs with keys the engine does not know', async () => {
    const f = fakeClient()
    f.blobs.set('../etc', sealBlob(KEY, '../etc', { v: 1, stays: [] }, 1))
    await pull(KEY, { client: () => f.c })
    expect(f.calls).toEqual(['list'])
  })
})

describe('state machine', () => {
  it('is off without a key, idle after a round, syncing in between, and errors by kind', async () => {
    db.store.delete('sync:key')
    await loadSyncStatus()
    expect(useSync.getState().status).toEqual({ kind: 'off' })
    await syncNow()
    expect(useSync.getState().status).toEqual({ kind: 'off' })
    db.store.set('sync:key', KEY)
    await loadSyncStatus()
    expect(useSync.getState().status).toEqual({ kind: 'idle', lastTs: null })
    const f = fakeClient()
    const seen: string[] = []
    const unsub = useSync.subscribe((s) => seen.push(s.status.kind))
    await syncNow({ client: () => f.c, now: () => 1234 })
    unsub()
    expect(seen).toEqual(['syncing', 'idle'])
    expect(useSync.getState().status).toEqual({ kind: 'idle', lastTs: 1234 })
    expect(db.store.get(SYNC_KV.lastTs)).toBe(1234)
    await syncNow({ client: () => fakeClient(() => new AccountError(0, 'network')).c })
    expect(useSync.getState().status).toEqual({ kind: 'error', error: 'network', lastTs: 1234 })
    await syncNow({ client: () => fakeClient(() => new AccountError(500, 'boom')).c })
    expect(useSync.getState().status).toMatchObject({ kind: 'error', error: 'http' })
    f.blobs.set('d_x:2023-11', sealBlob(OTHER, 'd_x:2023-11', { v: 1, stays: [] }, 9))
    await syncNow({ client: () => f.c })
    expect(useSync.getState().status).toMatchObject({ kind: 'error', error: 'locked' })
  })
  it('shares one round between overlapping calls', async () => {
    const f = fakeClient()
    const [a, b] = [syncNow({ client: () => f.c }), syncNow({ client: () => f.c })]
    await Promise.all([a, b])
    expect(f.calls.filter((x) => x === 'list')).toHaveLength(1)
  })
})

describe('start fresh', () => {
  it('drops the service blobs and the Drive key, forgets what was pushed, re-keys and pushes again', async () => {
    const f = fakeClient()
    profile.set({ name: 'Ada', units: 'km', homes: [], works: [] })
    const rec = data([visit(1, 1700000000, 1700000060)])
    const deps = { client: () => f.c, record: () => rec, now: () => 1000, drive: async () => 'tok' }
    await syncNow(deps)
    expect(f.blobs.size).toBe(2)
    f.calls.length = 0
    await upsertSyncedStays([{ id: 'c'.repeat(64), lat: 1, lng: 1, name: 'x', start: 1, end: 2 }])
    await startFresh(deps)
    expect(f.calls.slice(0, 2)).toEqual(['deleteAll', 'putVault'])
    expect(drive).toEqual({ deleted: 1, created: 1 })
    expect(f.blobs.size).toBe(2)
    expect(openBlob(new Uint8Array(32).fill(9), `${SRC}:2023-11`, f.blobs.get(`${SRC}:2023-11`)!)).toMatchObject({ v: 1 })
    expect(Object.keys(await loadSyncedStays())).toHaveLength(1)
    expect(useSync.getState().status).toEqual({ kind: 'idle', lastTs: 1000 })
  })
})
