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
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { DataContext } from '../../data/DataContext'
import type { Place } from '../../data/types'
import { sampleData } from '../../test/sample'
import { Places } from './Places'

const osm: Record<string, string | null> = { '42.36,-71.06': '12 Beacon St, Beacon Hill' }
const useAddress = vi.fn((lat: number, lng: number, on = true) => (on ? osm[`${lat},${lng}`] ?? null : undefined))
vi.mock('../../ingest/nominatim', () => ({ useAddress: (lat: number, lng: number, on?: boolean) => useAddress(lat, lng, on) }))
vi.mock('../../ingest/places', () => ({ need: () => undefined }))
vi.mock('../../world/PlacePhoto', () => ({ PlacePhoto: () => null }))

const place = (over: Partial<Place>): Place => ({
  lat: 42.36, lng: -71.06, label: null, role: null, city: 'Boston', country_code: 'US', n_visits: 3,
  total_hours: 2, first_ts: 1700000000, last_ts: 1700000000, name: null, ...over,
})

async function tags(places: Record<string, Place>) {
  const el = document.body.appendChild(document.createElement('div'))
  const root = createRoot(el)
  await act(async () => { root.render(createElement(DataContext.Provider, { value: { ...sampleData(), places } }, createElement(Places))) })
  const out = Array.from(el.querySelectorAll('.tag')).map((t) => ({ name: t.querySelector('.name')!.textContent, sub: t.querySelector('.sub')!.textContent }))
  await act(async () => root.unmount()); el.remove()
  return out
}

beforeEach(() => useAddress.mockClear())

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
  expect(useAddress.mock.calls.filter(([, , on]) => on).length).toBeGreaterThan(0)
  const [u] = await tags({ a: place({ address: null, lat: 40.7, lng: -74 }) })
  expect(u).toEqual({ name: 'Boston', sub: 'Boston, US' })
})
