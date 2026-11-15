import { describe, expect, it, vi } from 'vitest'

vi.mock('./db', () => ({ kv: { get: async () => undefined, set: async () => {} } }))
vi.mock('../usage/usage', () => ({ tally: () => {} }))

import { enrichPlaces } from './enrich'
import type { Data, Place } from '../data/types'

const place = (id: string, n: number): Place => ({ place_id: id, lat: 0, lng: 0, name: null, address: null, types: [], primary_type: null, photo: null, n_visits: n } as unknown as Place)

describe('enrichPlaces progress', () => {
  it('counts each lookup and ends with null', async () => {
    const places = { a: place('a', 5), b: place('b', 3), c: place('c', 1) }
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ displayName: { text: 'X' } }), { status: 200 }))
    const seen: unknown[] = []
    enrichPlaces({ places } as unknown as Data, { lookup: 'k', photo: 'k' }, () => {}, () => {}, (p) => seen.push(p))
    await vi.waitFor(() => expect(seen.at(-1)).toBeNull())
    expect(seen[0]).toEqual({ done: 0, total: 2 })
    expect(seen).toContainEqual({ done: 2, total: 2 })
    vi.unstubAllGlobals()
  })
  it('reports nothing without a key', async () => {
    const seen: unknown[] = []
    enrichPlaces({ places: { a: place('a', 5) } } as unknown as Data, { lookup: '', photo: '' }, () => {}, () => {}, (p) => seen.push(p))
    await new Promise((r) => setTimeout(r, 10))
    expect(seen).toEqual([])
  })
})
