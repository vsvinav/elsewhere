import { beforeEach, describe, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({ store: new Map<string, unknown>() }))
vi.mock('../ingest/db', () => ({ kv: { get: async (k: string) => db.store.get(k), set: async (k: string, v: unknown) => { db.store.set(k, v) }, del: async (k: string) => { db.store.delete(k) } } }))
import { b64 } from '../crew/keys'
import { clearLocalKey, deleteKey, DriveError, fetchOrCreateKey, KEY_FILE, loadLocalKey, SYNC_KEY_KV } from './driveKey'
import { SYNC_KV } from '../sync/local'

interface Call { method: string; url: string; body?: string; auth: string | null }
/** A Drive app folder with whatever files the test seeds; every call is logged. */
function fakeDrive(files: { id: string; createdTime: string; content: string }[] = [], opts: { expired?: boolean } = {}) {
  const calls: Call[] = []
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method ?? 'GET'
    const headers = new Headers(init?.headers)
    calls.push({ method, url, body: typeof init?.body === 'string' ? init.body : undefined, auth: headers.get('authorization') })
    if (opts.expired) return Response.json({ error: { code: 401, message: 'Invalid Credentials' } }, { status: 401 })
    const u = new URL(url)
    if (method === 'GET' && u.pathname === '/drive/v3/files') return Response.json({ files: files.map(({ id, createdTime }) => ({ id, createdTime })) })
    const m = /^\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname)
    if (m && method === 'GET' && u.searchParams.get('alt') === 'media') { const f = files.find((x) => x.id === m[1]); return f ? new Response(f.content) : new Response('', { status: 404 }) }
    if (m && method === 'DELETE') { files = files.filter((x) => x.id !== m[1]); return new Response(null, { status: 204 }) }
    if (method === 'POST' && u.pathname === '/upload/drive/v3/files') {
      const body = String(init?.body)
      const parts = body.split(/\r\n--[^\r\n]+/).map((p) => p.split('\r\n\r\n')[1]?.trim() ?? '')
      const content = parts.find((p) => p && !p.startsWith('{')) ?? ''
      files = [...files, { id: `f${files.length + 1}`, createdTime: '2026-01-01T00:00:00Z', content }]
      return Response.json({ id: files[files.length - 1].id })
    }
    return new Response('nope', { status: 500 })
  }) as typeof fetch
  return { calls, fetchFn, get files() { return files } }
}
const K1 = b64(Uint8Array.from({ length: 32 }, (_, i) => i)), K2 = b64(Uint8Array.from({ length: 32 }, (_, i) => 255 - i))

beforeEach(() => db.store.clear())

describe('the Drive key', () => {
  it('makes a fresh 32-byte key in the app folder when none is there, and keeps a copy beside the crew keys', async () => {
    const d = fakeDrive()
    const key = await fetchOrCreateKey('tok', d.fetchFn)
    expect(key).toHaveLength(32)
    expect(d.calls.map((c) => `${c.method} ${c.url.replace('https://www.googleapis.com', '')}`)).toEqual([
      `GET /drive/v3/files?spaces=appDataFolder&q=${encodeURIComponent(`name='${KEY_FILE}'`)}&fields=${encodeURIComponent('files(id,createdTime)')}`,
      'POST /upload/drive/v3/files?uploadType=multipart',
    ])
    expect(d.calls.every((c) => c.auth === 'Bearer tok')).toBe(true)
    const upload = d.calls[1].body!
    expect(upload).toContain(`"name":"${KEY_FILE}"`)
    expect(upload).toContain('"parents":["appDataFolder"]')
    expect(upload).toContain('"mimeType":"application/octet-stream"')
    expect(d.files).toHaveLength(1)
    expect(d.files[0].content).toBe(b64(key))
    expect(db.store.get(SYNC_KEY_KV)).toBe(b64(key))
    expect(await loadLocalKey()).toEqual(key)
    // The upload is the only POST; nothing about the token is written anywhere.
    expect(JSON.stringify([...db.store])).not.toContain('tok')
  })
  it('a key other than the one this device held forgets what was pushed, so everything goes up again under it', async () => {
    db.store.set(SYNC_KEY_KV, K1)
    db.store.set(SYNC_KV.pushed, { 'i_a:2026-01': 'h' }); db.store.set(SYNC_KV.remote, { profile: 5 }); db.store.set(SYNC_KV.profileHash, 'h'); db.store.set(SYNC_KV.lastTs, 9); db.store.set(SYNC_KV.stays, { x: 1 })
    await fetchOrCreateKey('tok', fakeDrive([{ id: 'a', createdTime: '2026-01-01T00:00:00Z', content: K1 }]).fetchFn)
    expect(db.store.get(SYNC_KV.pushed)).toEqual({ 'i_a:2026-01': 'h' })
    await fetchOrCreateKey('tok', fakeDrive([{ id: 'a', createdTime: '2026-01-01T00:00:00Z', content: K2 }]).fetchFn)
    expect(db.store.get(SYNC_KEY_KV)).toBe(K2)
    for (const k of [SYNC_KV.pushed, SYNC_KV.remote, SYNC_KV.profileHash, SYNC_KV.lastTs]) expect(db.store.has(k), k).toBe(false)
    expect(db.store.get(SYNC_KV.stays)).toEqual({ x: 1 })
  })
  it('reads the one key that is there', async () => {
    const d = fakeDrive([{ id: 'a', createdTime: '2025-05-01T00:00:00Z', content: K1 }])
    expect(b64(await fetchOrCreateKey('tok', d.fetchFn))).toBe(K1)
    expect(d.calls.map((c) => c.method)).toEqual(['GET', 'GET'])
  })
  it('two files from a race: the oldest by createdTime wins and the newer one is deleted', async () => {
    const d = fakeDrive([{ id: 'newer', createdTime: '2026-02-02T00:00:00Z', content: K2 }, { id: 'older', createdTime: '2026-02-01T23:59:59Z', content: K1 }])
    expect(b64(await fetchOrCreateKey('tok', d.fetchFn))).toBe(K1)
    expect(d.files.map((f) => f.id)).toEqual(['older'])
    expect(d.calls.filter((c) => c.method === 'DELETE').map((c) => c.url)).toEqual(['https://www.googleapis.com/drive/v3/files/newer'])
  })
  it('an expired token is a typed error, and the local copy stays untouched', async () => {
    db.store.set(SYNC_KEY_KV, K1)
    const d = fakeDrive([], { expired: true })
    const e = await fetchOrCreateKey('old', d.fetchFn).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(DriveError)
    expect((e as DriveError).kind).toBe('auth')
    expect(db.store.get(SYNC_KEY_KV)).toBe(K1)
  })
  it('a file that is not a 32-byte key is treated as corrupt, not used', async () => {
    const d = fakeDrive([{ id: 'a', createdTime: '2025-05-01T00:00:00Z', content: 'c2hvcnQ=' }])
    const e = await fetchOrCreateKey('tok', d.fetchFn).catch((x: unknown) => x)
    expect((e as DriveError).kind).toBe('corrupt')
  })
  it('deleteKey removes every copy in Drive and the local one', async () => {
    db.store.set(SYNC_KEY_KV, K1)
    const d = fakeDrive([{ id: 'a', createdTime: '2025-05-01T00:00:00Z', content: K1 }, { id: 'b', createdTime: '2025-06-01T00:00:00Z', content: K2 }])
    await deleteKey('tok', d.fetchFn)
    expect(d.files).toEqual([])
    expect(db.store.has(SYNC_KEY_KV)).toBe(false)
    await clearLocalKey()
    expect(await loadLocalKey()).toBeNull()
  })
})
