// The sync key, kept in the user's own Google Drive app folder so a second device signed into the same Google account
// finds it. The access token is handed in by the caller and never stored; the key itself is kept beside the crew keys.
import { b64, unb64 } from '../crew/keys'
import { kv } from '../ingest/db'
import { KEY_BYTES, newSyncKey } from '../sync/wire'

export const KEY_FILE = 'elsewhere.key'
export const SYNC_KEY_KV = 'sync:key'
const API = 'https://www.googleapis.com'
const LIST = `${API}/drive/v3/files?spaces=appDataFolder&q=${encodeURIComponent(`name='${KEY_FILE}'`)}&fields=${encodeURIComponent('files(id,createdTime)')}`

export type DriveErrorKind = 'auth' | 'network' | 'corrupt' | 'http'
export class DriveError extends Error {
  constructor(public kind: DriveErrorKind, public status = 0) { super(kind); this.name = 'DriveError' }
}

async function drive(token: string, fetchFn: typeof fetch, method: string, url: string, body?: BodyInit, contentType?: string): Promise<Response> {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` }
  if (contentType) headers['content-type'] = contentType
  let res: Response
  try { res = await fetchFn(url, { method, headers, body }) } catch { throw new DriveError('network') }
  if (res.status === 401) throw new DriveError('auth', 401)
  if (!res.ok) throw new DriveError('http', res.status)
  return res
}
interface DriveFile { id: string; createdTime: string }
async function listKeys(token: string, fetchFn: typeof fetch): Promise<DriveFile[]> {
  const r = (await (await drive(token, fetchFn, 'GET', LIST)).json()) as { files?: unknown }
  const files = Array.isArray(r.files) ? (r.files as Partial<DriveFile>[]).filter((f): f is DriveFile => typeof f.id === 'string' && typeof f.createdTime === 'string') : []
  return files.sort((a, b) => a.createdTime.localeCompare(b.createdTime) || a.id.localeCompare(b.id))
}
const deleteFile = (token: string, fetchFn: typeof fetch, id: string) => drive(token, fetchFn, 'DELETE', `${API}/drive/v3/files/${encodeURIComponent(id)}`)

function parseKey(text: string): Uint8Array {
  let key: Uint8Array
  try { key = unb64(text.trim()) } catch { throw new DriveError('corrupt') }
  if (key.length !== KEY_BYTES) throw new DriveError('corrupt')
  return key
}
async function createKey(token: string, fetchFn: typeof fetch, key: Uint8Array): Promise<void> {
  const boundary = 'elsewhere-key'
  const meta = JSON.stringify({ name: KEY_FILE, parents: ['appDataFolder'], mimeType: 'application/octet-stream' })
  const body = `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: application/octet-stream\r\n\r\n${b64(key)}\r\n--${boundary}--`
  await drive(token, fetchFn, 'POST', `${API}/upload/drive/v3/files?uploadType=multipart`, body, `multipart/related; boundary=${boundary}`)
}

/** The account's key: the oldest `elsewhere.key` in the app folder (newer ones from a race are removed), or a new one. */
export async function fetchOrCreateKey(token: string, fetchFn: typeof fetch = fetch): Promise<Uint8Array> {
  const files = await listKeys(token, fetchFn)
  let key: Uint8Array
  if (files.length) {
    const [oldest, ...newer] = files
    key = parseKey(await (await drive(token, fetchFn, 'GET', `${API}/drive/v3/files/${encodeURIComponent(oldest.id)}?alt=media`)).text())
    await Promise.all(newer.map((f) => deleteFile(token, fetchFn, f.id)))
  } else {
    key = newSyncKey()
    await createKey(token, fetchFn, key)
  }
  await kv.set(SYNC_KEY_KV, b64(key))
  return key
}
/** Start fresh and account deletion: every copy in Drive goes, then the local one. */
export async function deleteKey(token: string, fetchFn: typeof fetch = fetch): Promise<void> {
  const files = await listKeys(token, fetchFn)
  await Promise.all(files.map((f) => deleteFile(token, fetchFn, f.id)))
  await clearLocalKey()
}
export async function loadLocalKey(): Promise<Uint8Array | null> {
  const s = await kv.get<unknown>(SYNC_KEY_KV)
  if (typeof s !== 'string') return null
  try { const k = unb64(s); return k.length === KEY_BYTES ? k : null } catch { return null }
}
export const clearLocalKey = () => kv.del(SYNC_KEY_KV)
