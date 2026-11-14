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
  del: (k: string) => tx('readwrite', (s) => s.delete(k)),
}
