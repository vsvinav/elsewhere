// @vitest-environment jsdom
vi.hoisted(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof matchMedia
  // Every tag counts as on screen, so the lazy lookups run straight away.
  class IO {
    constructor(private cb: (e: { isIntersecting: boolean; target: Element }[]) => void) {}
    observe(el: Element) { this.cb([{ isIntersecting: true, target: el }]) }
    disconnect() {} unobserve() {}
  }
  window.IntersectionObserver = IO as unknown as typeof IntersectionObserver
})
import { act, createElement, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import type { Cached } from '../../ingest/places'
import { DataContext } from '../../data/DataContext'
import type { Place } from '../../data/types'
import { sampleData } from '../../test/sample'
import { Places } from './Places'

const osm: Record<string, string | null> = { '42.36,-71.06': '12 Beacon St, Beacon Hill' }
const useAddress = vi.fn((lat: number, lng: number, on = true) => (on ? osm[`${lat},${lng}`] ?? null : undefined))
vi.mock('../../ingest/nominatim', () => ({ useAddress: (lat: number, lng: number, on?: boolean) => useAddress(lat, lng, on) }))
// A stand-in Places pool: lookups land only when a test calls `google.answer`; until then the id counts as unresolved.
const google = vi.hoisted(() => {
  const subs = new Set<() => void>()
  const pending = new Set<string>()
  let snap = { cache: {} as Record<string, Cached>, pending: 0, total: 0 }
  return {
    slow: false,
    reset() { pending.clear(); snap = { cache: {}, pending: 0, total: 0 }; google.slow = false },
    need(ids: string[]) { if (google.slow) ids.forEach((id) => pending.add(id)) },
    answer(id: string, c: Cached) { pending.delete(id); snap = { ...snap, cache: { ...snap.cache, [id]: c } }; subs.forEach((f) => f()) },
    isResolved: (id: string, _p: unknown, c: Record<string, Cached>) => id in c || !pending.has(id),
    subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f) } },
    snapshot: () => snap,
  }
})
vi.mock('../../ingest/places', () => ({ need: google.need, isResolved: google.isResolved, usePlaces: () => useSyncExternalStore(google.subscribe, google.snapshot) }))
vi.mock('../../world/PlacePhoto', () => ({ PlacePhoto: () => null }))

const place = (over: Partial<Place>): Place => ({
  lat: 42.36, lng: -71.06, label: null, role: null, city: 'Boston', country_code: 'US', n_visits: 3,
  total_hours: 2, first_ts: 1700000000, last_ts: 1700000000, name: null, ...over,
})

const read = (el: Element) => Array.from(el.querySelectorAll('.tag')).map((t) => ({ name: t.querySelector('.name')!.textContent, sub: t.querySelector('.sub')!.textContent }))

async function mount(places: Record<string, Place>) {
  const el = document.body.appendChild(document.createElement('div'))
  const root = createRoot(el)
  const render = (ps: Record<string, Place>) => root.render(createElement(DataContext.Provider, { value: { ...sampleData(), places: ps } }, createElement(Places)))
  await act(async () => { render(places) })
  return { el, render, unmount: async () => { await act(async () => root.unmount()); el.remove() } }
}

async function tags(places: Record<string, Place>) {
  const m = await mount(places)
  const out = read(m.el)
  await m.unmount()
  return out
}

const asked = () => useAddress.mock.calls.filter(([, , on]) => on).length

beforeEach(() => { useAddress.mockClear(); google.reset() })

test('an unnamed stop with a Places address shows it as the name and the sub-line', async () => {
  const [t] = await tags({ a: place({ address: '1 Devonshire Pl, Boston, MA 02109, USA' }) })
  expect(t).toEqual({ name: '1 Devonshire Pl, Boston', sub: '1 Devonshire Pl, Boston' })
  expect(useAddress.mock.calls.some(([, , on]) => on)).toBe(false)
})

test('a named stop keeps its name and shows the address under it', async () => {
  const [t] = await tags({ a: place({ name: 'Devonshire Tower', address: '1 Devonshire Pl, Boston, MA 02109, USA' }) })
  expect(t).toEqual({ name: 'Devonshire Tower', sub: '1 Devonshire Pl, Boston' })
})

test('without a Places address the tag asks Nominatim once in view, and reads City, CC until it answers', async () => {
  const [t] = await tags({ a: place({ address: null }) })
  expect(t).toEqual({ name: '12 Beacon St, Beacon Hill', sub: '12 Beacon St, Beacon Hill' })
  expect(asked()).toBeGreaterThan(0)
  const [u] = await tags({ a: place({ address: null, lat: 40.7, lng: -74 }) })
  expect(u).toEqual({ name: 'Boston', sub: 'Boston, US' })
})

test('Nominatim waits for Places to answer, and is asked only when that answer has no street', async () => {
  google.slow = true
  const m = await mount({ a: place({ address: null }) })
  expect(asked()).toBe(0)
  expect(read(m.el)[0]).toEqual({ name: 'Boston', sub: 'Boston, US' })
  await act(async () => { google.answer('a', { name: null, address: null, types: [], primary_type: null, photo: null }) })
  expect(asked()).toBeGreaterThan(0)
  expect(read(m.el)[0]).toEqual({ name: '12 Beacon St, Beacon Hill', sub: '12 Beacon St, Beacon Hill' })
  await m.unmount()
})

test('Nominatim is never asked when Places comes back with a street', async () => {
  google.slow = true
  const m = await mount({ a: place({ address: null }) })
  // The app lays the cached address over the record in the same pass, so the tag sees both land together.
  await act(async () => {
    google.answer('a', { name: null, address: '1 Devonshire Pl, Boston, MA', types: [], primary_type: null, photo: null })
    m.render({ a: place({ address: '1 Devonshire Pl, Boston, MA' }) })
  })
  expect(read(m.el)[0]).toEqual({ name: '1 Devonshire Pl, Boston', sub: '1 Devonshire Pl, Boston' })
  expect(asked()).toBe(0)
  await m.unmount()
})
