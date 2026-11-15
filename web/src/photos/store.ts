// Photos the visitor snapped, kept in the browser: blobs under `photo:<id>` and one `photos` index in the record's kv store.
import { create } from 'zustand'
import { kv } from '../ingest/db'
import type { PhotoMeta } from './meta'

export interface Photo extends PhotoMeta { id: string; caption?: string }

const INDEX = 'photos'
const blobKey = (id: string) => `photo:${id}`
const uuid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)

export const listPhotos = async (): Promise<Photo[]> => (await kv.get<Photo[]>(INDEX)) ?? []
export const photoBlob = (id: string) => kv.get<Blob>(blobKey(id))

/** The blob and its index row land together. The first photo asks the browser to keep this origin's storage. */
export async function savePhoto(blob: Blob, meta: PhotoMeta, caption?: string): Promise<Photo> {
  const list = await listPhotos()
  const photo: Photo = { id: uuid(), ...meta, ...(caption ? { caption } : {}) }
  await kv.setAll([[blobKey(photo.id), blob], [INDEX, [...list, photo]]])
  if (!list.length) navigator.storage?.persist?.().catch(() => {})
  return photo
}

export async function updatePhoto(id: string, patch: Partial<Pick<Photo, 'caption'>>): Promise<Photo[]> {
  const list = (await listPhotos()).map((p) => (p.id === id ? { ...p, ...patch } : p))
  await kv.set(INDEX, list)
  return list
}

export async function deletePhoto(id: string): Promise<Photo[]> {
  const list = (await listPhotos()).filter((p) => p.id !== id)
  await kv.setAll([[INDEX, list]])
  await kv.del(blobKey(id))
  return list
}

export async function clearPhotos() {
  const list = await listPhotos()
  for (const p of list) await kv.del(blobKey(p.id))
  await kv.del(INDEX)
}

/** The picture at most `max` px on its long edge as a JPEG; the file as it came when the browser cannot decode it. */
export async function downscale(file: Blob, max = 2048): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return file
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    bmp.close()
    const out = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.86))
    return out ?? file
  } catch { return file }
}

interface PhotosState {
  /** Null until the index has been read once. */
  photos: Photo[] | null
  load(): Promise<void>
  add(blob: Blob, meta: PhotoMeta, caption?: string): Promise<Photo>
  setCaption(id: string, caption: string): Promise<void>
  remove(id: string): Promise<void>
  clear(): Promise<void>
}

export const usePhotos = create<PhotosState>((set, get) => ({
  photos: null,
  load: async () => { if (get().photos) return; set({ photos: await listPhotos().catch(() => []) }) },
  add: async (blob, meta, caption) => { const p = await savePhoto(blob, meta, caption); set({ photos: [...(get().photos ?? []), p] }); return p },
  setCaption: async (id, caption) => set({ photos: await updatePhoto(id, caption ? { caption } : { caption: undefined }) }),
  remove: async (id) => set({ photos: await deletePhoto(id) }),
  clear: async () => { await clearPhotos(); set({ photos: [] }) },
}))

/** Photos pinned to one place, newest first. */
export const forPlace = (photos: Photo[] | null, placeId: string) => (photos ?? []).filter((p) => p.placeId === placeId).sort((a, b) => b.ts - a.ts)
