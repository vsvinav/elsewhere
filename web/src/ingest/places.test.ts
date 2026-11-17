// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ stored: undefined as Record<string, unknown> | undefined, sets: [] as Record<string, unknown>[] }))
vi.mock('./db', () => ({ kv: { get: async () => db.stored, set: async (_k: string, v: Record<string, unknown>) => { db.sets.push(JSON.parse(JSON.stringify(v))) } } }))
const usage = vi.hoisted(() => ({ details: 0 }))
vi.mock('../usage/usage', () => ({ tally: () => { usage.details++ } }))
const st = vi.hoisted(() => ({ keyOk: null as boolean | null }))
vi.mock('./settings', () => ({ settings: { get: () => ({ mapsKey: 'k', keyOk: st.keyOk }) } }))

import { apply, clusterName, isResolved, lookup, need, onError, properName, reset, setKey, snapshot, subscribe } from './places'
import type { Place } from '../data/types'

const place = (id: string, n = 2, extra: Partial<Place> = {}): Place => ({ place_id: id, lat: 0, lng: 0, name: null, address: null, types: [], primary_type: null, photo: null, n_visits: n, role: null, label: null, ...extra } as unknown as Place)
const ok = (name: string) => new Response(JSON.stringify({ displayName: { text: name }, types: ['cafe'], primaryType: 'cafe' }), { status: 200 })
const settle = () => new Promise((r) => setTimeout(r, 20))

beforeEach(() => { db.stored = undefined; db.sets.length = 0; usage.details = 0; st.keyOk = null; reset(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('need', () => {
  it('fetches each id once, skipping cached and home ids, and notifies subscribers', async () => {
    db.stored = { cached: { name: 'Old', address: null, types: [], primary_type: null, photo: null } }
    const asked: string[] = []
    vi.stubGlobal('fetch', async (url: string) => { asked.push(decodeURIComponent(url.split('/places/')[1])); return ok('New') })
    const places = { a: place('a'), b: place('b'), cached: place('cached'), home: place('home', 9, { role: 'home' }) }
    const seen: number[] = []
    subscribe(() => seen.push(snapshot().pending))
    setKey('k')
    need(['a', 'b', 'cached', 'home', 'a'], places)
    need(['a', 'b'], places)
    await vi.waitFor(() => { expect(Object.keys(snapshot().cache)).toHaveLength(3); expect(snapshot().pending).toBe(0) })
    expect(asked.sort()).toEqual(['a', 'b'])
    expect(usage.details).toBe(2)
    expect(seen).toContain(2)
    expect(snapshot().total).toBe(0)
    const out = apply(places, snapshot().cache, '')
    expect(out.a.name).toBe('New')
    expect(out.cached.name).toBe('Old')
    expect(out.home.name).toBeNull()
  })
  it('fetches nothing without a key', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    setKey('')
    need(['a'], { a: place('a') })
    await settle()
    expect(fetch).not.toHaveBeenCalled()
    expect(snapshot().pending).toBe(0)
  })
  it('fetches nothing once the key has been refused', async () => {
    st.keyOk = false
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    setKey('k')
    need(['a'], { a: place('a') })
    await settle()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('retries a passing failure once, two seconds later, without stopping the pool', async () => {
    vi.useFakeTimers()
    let calls = 0
    vi.stubGlobal('fetch', async () => { calls++; if (calls === 1) throw new TypeError('Failed to fetch'); return ok('Back') })
    const errors: Error[] = []
    onError((e) => errors.push(e))
    setKey('k')
    need(['a'], { a: place('a') })
    await vi.advanceTimersByTimeAsync(50)
    expect(calls).toBe(1)
    expect(snapshot().pending).toBe(1)
    await vi.advanceTimersByTimeAsync(1900)
    expect(calls).toBe(1)
    await vi.advanceTimersByTimeAsync(200)
    expect(calls).toBe(2)
    expect(snapshot().cache.a?.name).toBe('Back')
    need(['b'], { b: place('b') })
    await vi.advanceTimersByTimeAsync(50)
    expect(calls).toBe(3)
    expect(errors).toEqual([])
  })
  it('stops the pool and reports when the key is refused', async () => {
    let calls = 0
    vi.stubGlobal('fetch', async () => { calls++; return new Response(JSON.stringify({ error: { message: 'Key denied of service' } }), { status: 403 }) })
    const errors: string[] = []
    onError((e) => errors.push(e.message))
    setKey('k')
    need(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], Object.fromEntries('abcdefgh'.split('').map((id) => [id, place(id)])))
    await vi.waitFor(() => expect(errors.length).toBeGreaterThan(0))
    await settle()
    expect(errors[0]).toBe('Key denied')
    expect(calls).toBeLessThanOrEqual(4)
    expect(snapshot().pending).toBe(0)
    need(['z'], { z: place('z') })
    await settle()
    expect(calls).toBeLessThanOrEqual(4)
  })
})

describe('isResolved', () => {
  it('is true once cached, when there is no usable key, or for a place need would skip', () => {
    setKey('k')
    expect(isResolved('a', place('a'), {})).toBe(false)
    expect(isResolved('a', place('a'), { a: { name: null, address: null, types: [], primary_type: null, photo: null } })).toBe(true)
    expect(isResolved('home', place('home', 9, { role: 'home' }), {})).toBe(true)
    expect(isResolved('n', place('n', 2, { name: 'Cafe', photo: 'p' }), {})).toBe(true)
    st.keyOk = false
    expect(isResolved('a', place('a'), {})).toBe(true)
    st.keyOk = null
    setKey('')
    expect(isResolved('a', place('a'), {})).toBe(true)
  })
})

describe('clusterName shares the cache with need', () => {
  it('keeps both writers’ results and persists them together', async () => {
    vi.stubGlobal('fetch', async (url: string) => ok(`Name ${decodeURIComponent(url.split('/places/')[1])}`))
    const places = { a: place('a'), b: place('b') }
    setKey('k')
    const p = clusterName(['a'], places, 'k')
    need(['b'], places)
    expect(await p).toBe('Name a')
    await vi.waitFor(() => { expect(Object.keys(snapshot().cache).sort()).toEqual(['a', 'b']); expect(snapshot().pending).toBe(0) })
    await vi.waitFor(() => expect(db.sets.length).toBeGreaterThan(0), { timeout: 2000 })
    expect(Object.keys(db.sets.at(-1)!).sort()).toEqual(['a', 'b'])
    // A later clusterName over the same ids pays nothing.
    const before = usage.details
    expect(await clusterName(['b'], places, 'k')).toBe('Name b')
    expect(usage.details).toBe(before)
  })
})

describe('lookup', () => {
  it('treats a missing place as known-empty and surfaces API errors', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }))
    expect(await lookup('x', 'k')).toEqual({ name: null, address: null, types: [], primary_type: null, photo: null })
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { message: 'Over quota of service' } }), { status: 429 }))
    await expect(lookup('x', 'k')).rejects.toThrow('Over quota')
  })
})

describe('properName', () => {
  it('rejects addresses and numbers, keeps proper names', () => {
    expect(properName({ name: '12 Main St', types: ['street_address'] })).toBe(false)
    expect(properName({ name: 'Savoy', types: ['premise'] })).toBe(false)
    expect(properName({ name: 'Savoy Apartments', primary_type: 'apartment_building' })).toBe(true)
    expect(properName({ name: 'Blue Bottle', types: ['cafe', 'point_of_interest'] })).toBe(true)
  })
})
