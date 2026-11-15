// @vitest-environment jsdom
vi.hoisted(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof matchMedia
  class IO { observe() {} disconnect() {} unobserve() {} }
  window.IntersectionObserver = IO as unknown as typeof IntersectionObserver
})
import { readFileSync, readdirSync } from 'node:fs'
import { sampleData } from '../test/sample'
import { join } from 'node:path'
import { createElement } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { DataContext } from '../data/DataContext'
import { RecordContext, type Record_ } from './App'

// Maps need WebGL or Google; the smoke test is about everything around them.
vi.mock('../world/FlightMap', () => ({ FlightMap: () => createElement('div', { className: 'flightmap' }) }))
vi.mock('../world/PlaceMap', () => ({ PlaceMap: () => createElement('div', { className: 'placemap' }) }))
vi.mock('../world/TripMap', () => ({ TripMap: () => createElement('div', { className: 'tripmap' }) }))
vi.mock('../world/TrailMap', () => ({ TrailMap: () => createElement('div', { className: 'trailmap' }) }))
vi.mock('../world/PlacePhoto', () => ({ PlacePhoto: () => createElement('div', { className: 'photo' }) }))


const data = sampleData()
const rec: Record_ = { mine: false, stage: null, importError: null, enrichError: null, importFile() {}, reset() {}, editProfile() {} }

const screens = {
  Home: () => import('../tabs/Home/Home').then((m) => m.Home),
  Stats: () => import('../tabs/Stats/Stats').then((m) => m.Stats),
  Facts: () => import('../tabs/Facts/Facts').then((m) => m.Facts),
  Places: () => import('../tabs/Places/Places').then((m) => m.Places),
  Trips: () => import('../tabs/Trips/Trips').then((m) => m.Trips),
  Flights: () => import('../tabs/Flights/Flights').then((m) => m.Flights),
}

describe('every tab renders a record built through the import pipeline', () => {
  for (const [name, load] of Object.entries(screens)) {
    test(name, async () => {
      const Screen = await load()
      const el = document.body.appendChild(document.createElement('div'))
      const root = createRoot(el)
      const errors: unknown[] = []
      const spy = vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a))
      await act(async () => { root.render(createElement(RecordContext.Provider, { value: rec }, createElement(DataContext.Provider, { value: data }, createElement(Screen)))) })
      expect(errors, 'console errors while rendering').toEqual([])
      expect(el.innerHTML.length).toBeGreaterThan(500)
      expect(el.querySelector('main, section')).not.toBeNull()
      await act(async () => root.unmount())
      spy.mockRestore(); el.remove()
    })
  }
})

test('no two @keyframes share a name across the stylesheets (a clash silently rewrites the other animation)', () => {
  const seen = new Map<string, string>()
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.css') ? [join(d, e.name)] : []))
  for (const f of walk(join(__dirname, '..'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/@keyframes\s+([\w-]+)/g)) {
      const prev = seen.get(m[1])
      expect(prev, `@keyframes ${m[1]} defined in both ${prev} and ${f}`).toBeUndefined()
      seen.set(m[1], f)
    }
  }
})
