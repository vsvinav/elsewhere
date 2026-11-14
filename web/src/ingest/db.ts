// One IndexedDB store: the user's built record (paths kept separate, like the static files) and the places cache.
const DB = 'elsewhere', STORE = 'kv'

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const q = indexedDB.open(DB, 1)
    q.onupgradeneeded = () => q.result.createObjectStore(STORE)
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error)
  })
}
async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((res, rej) => { const r = f(db.transaction(STORE, mode).objectStore(STORE)); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
}
export const kv = {
  get: <T>(k: string) => tx<T | undefined>('readonly', (s) => s.get(k) as IDBRequest<T | undefined>),
  set: (k: string, v: unknown) => tx('readwrite', (s) => s.put(v, k)),
  /** Several keys in one transaction: all land or none do. */
  setAll: async (entries: [string, unknown][]) => {
    const db = await open()
    return new Promise<void>((res, rej) => { const t = db.transaction(STORE, 'readwrite'); const s = t.objectStore(STORE); for (const [k, v] of entries) s.put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error) })
  },
  del: (k: string) => tx('readwrite', (s) => s.delete(k)),
}
