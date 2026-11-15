const mem = new Map<string, unknown>()
vi.mock('../ingest/db', () => ({
  kv: {
    get: async (k: string) => mem.get(k),
    set: async (k: string, v: unknown) => { mem.set(k, v) },
    setAll: async (entries: [string, unknown][]) => { for (const [k, v] of entries) mem.set(k, v) },
    del: async (k: string) => { mem.delete(k) },
  },
}))

import { clearPhotos, deletePhoto, listPhotos, photoBlob, savePhoto, updatePhoto, usePhotos } from './store'

const NOW = Date.UTC(2025, 10, 15, 12)
const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' })

beforeEach(() => { mem.clear(); usePhotos.setState({ photos: null }) })

describe('photo storage', () => {
  it('saves the blob and its row together and reads them back; the first save asks for persistent storage', async () => {
    const persist = vi.fn(async () => true)
    Object.defineProperty(navigator, 'storage', { value: { persist }, configurable: true })
    const p = await savePhoto(jpeg(), { ts: NOW, lat: 38.7, lng: -9.1, placeId: 'lis', city: 'Lisbon' }, 'Tram 28')
    expect(p.id).toBeTruthy()
    expect(await listPhotos()).toEqual([{ id: p.id, ts: NOW, lat: 38.7, lng: -9.1, placeId: 'lis', city: 'Lisbon', caption: 'Tram 28' }])
    expect((await photoBlob(p.id))!.size).toBe(4)
    expect(persist).toHaveBeenCalledTimes(1)
    await savePhoto(jpeg(), { ts: NOW })
    expect(persist).toHaveBeenCalledTimes(1)
    expect((await listPhotos()).length).toBe(2)
  })
  it('updates a caption, deletes one photo with its blob, clears them all', async () => {
    const a = await savePhoto(jpeg(), { ts: NOW, placeId: 'a' })
    const b = await savePhoto(jpeg(), { ts: NOW + 1, placeId: 'b' })
    await updatePhoto(a.id, { caption: 'hello' })
    expect((await listPhotos()).find((p) => p.id === a.id)!.caption).toBe('hello')
    await deletePhoto(a.id)
    expect((await listPhotos()).map((p) => p.id)).toEqual([b.id])
    expect(await photoBlob(a.id)).toBeUndefined()
    expect(await photoBlob(b.id)).toBeDefined()
    await clearPhotos()
    expect(await listPhotos()).toEqual([])
    expect(await photoBlob(b.id)).toBeUndefined()
    expect(mem.size).toBe(0)
  })
  it('the store loads once and mirrors adds and removes', async () => {
    await savePhoto(jpeg(), { ts: NOW, placeId: 'x' })
    await usePhotos.getState().load()
    expect(usePhotos.getState().photos!.length).toBe(1)
    const p = await usePhotos.getState().add(jpeg(), { ts: NOW, placeId: 'y' })
    expect(usePhotos.getState().photos!.map((q) => q.placeId)).toEqual(['x', 'y'])
    await usePhotos.getState().remove(p.id)
    expect(usePhotos.getState().photos!.map((q) => q.placeId)).toEqual(['x'])
    await usePhotos.getState().clear()
    expect(usePhotos.getState().photos).toEqual([])
    expect(await listPhotos()).toEqual([])
  })
})
