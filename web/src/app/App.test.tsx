// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

vi.hoisted(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof matchMedia
  class IO { observe() {} disconnect() {} unobserve() {} }
  window.IntersectionObserver = IO as unknown as typeof IntersectionObserver
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) })
})
vi.mock('../ingest/db', () => {
  const m = new Map<string, unknown>()
  return { kv: { get: async (k: string) => m.get(k), set: async (k: string, v: unknown) => { m.set(k, v) }, setAll: async (e: Record<string, unknown>) => { for (const [k, v] of Object.entries(e)) m.set(k, v) }, del: async (k: string) => { m.delete(k) } } }
})
const bundle = vi.hoisted(() => ({ missing: false }))
vi.mock('../data/load', async (orig) => {
  const real = await orig<typeof import('../data/load')>()
  return { ...real, loadData: async () => { if (bundle.missing) throw new real.DataLoadError('/data/record.json', '404'); return sampleData() }, loadPaths: async () => [] }
})
vi.mock('../ingest', () => ({ clearRecord: async () => {}, ingestFile: async () => { throw new Error('no') }, loadRecord: async () => undefined, rederive: async (d: unknown) => d }))
vi.mock('../account/sync', async (orig) => ({ ...(await orig<typeof import('../account/sync')>()), startVaultSync: () => () => {} }))
vi.mock('../world/FlightMap', () => ({ FlightMap: () => createElement('div') }))
vi.mock('../world/PlaceMap', () => ({ PlaceMap: () => createElement('div') }))
vi.mock('../world/TripMap', () => ({ TripMap: () => createElement('div') }))
vi.mock('../world/TrailMap', () => ({ TrailMap: () => createElement('div') }))
vi.mock('../world/PlacePhoto', () => ({ PlacePhoto: () => createElement('div') }))

import { sampleData } from '../test/sample'
import { App } from './App'
import { profile } from '../profile/profile'
import { useStore } from '../store/useStore'
import { ACCOUNT_KV, resetAccountForTest, useAccount } from '../account/store'
import { kv } from '../ingest/db'
import { settings } from '../ingest/settings'
import { WELCOME_LINE } from '../account/Welcome'

const ses = { session: 's', id: 'acct_1', email: 'v@example.org' }
const roots: Root[] = []
const mount = async () => {
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host); roots.push(root)
  await act(async () => root.render(createElement(App)))
  await act(() => new Promise((r) => setTimeout(r, 20)))
  return host
}
const chip = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('.tourline .chip')].find((b) => b.textContent === 'Log in')

// App reads the stored account on mount, so the device's memory is seeded through the store's own keys.
beforeEach(async () => {
  document.body.innerHTML = ''
  await kv.set(ACCOUNT_KV.welcomed, true); await kv.del(ACCOUNT_KV.session)
  profile.set({ name: 'V', units: 'km', homes: [{ lat: 48.85, lng: 2.35, city: 'Paris', cc: 'FR', from: 0, to: null }], works: [] })
  useStore.setState({ tab: 'home', settingsOpen: false, crewOpen: false })
  // A developer's .env.local may carry a Maps key; the key gate must not stand in for the tour here.
  settings.set({ mapsKey: '', keyOk: null, mapsOk: null })
  resetAccountForTest()
  bundle.missing = false
})
afterEach(() => { for (const r of roots.splice(0)) act(() => r.unmount()) })

describe('the way back to Welcome', () => {
  it('signed out, the header carries a Log in chip that opens the welcome screen; Not now returns to the tour', async () => {
    const host = await mount()
    expect(host.querySelector('.tourline')).not.toBeNull()
    expect(host.querySelector('.tourline .caps .who')?.textContent).toMatch(/record$/)
    expect(host.querySelector('.tourline .chip.settings')?.textContent).toBe('Settings')
    expect(host.textContent).not.toContain(WELCOME_LINE)
    await act(async () => chip(host)!.click())
    expect(host.textContent).toContain(WELCOME_LINE)
    expect(host.querySelector('.tourline')).toBeNull()
    await act(async () => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Not now')!.click())
    expect(host.textContent).not.toContain(WELCOME_LINE)
    expect(host.querySelector('.tourline')).not.toBeNull()
    expect(useAccount.getState().welcomed).toBe(true)
  })
  it('signed in, the chip is gone', async () => {
    await kv.set(ACCOUNT_KV.session, ses)
    const host = await mount()
    expect(useAccount.getState().session).toEqual(ses)
    expect(host.querySelector('.tourline')).not.toBeNull()
    expect(chip(host)).toBeUndefined()
  })
  it('Settings → Log in or sign up shows the welcome screen', async () => {
    useStore.setState({ settingsOpen: true })
    const host = await mount()
    await act(async () => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Log in or sign up')!.click())
    expect(host.textContent).toContain(WELCOME_LINE)
  })
})

describe('no record and no demo', () => {
  it('shows the viewer door in place of the import page', async () => {
    bundle.missing = true
    profile.set(null)
    const host = await mount()
    expect(host.textContent).toContain('Your phone keeps the record.')
    expect([...host.querySelectorAll('.ob-actions .btn')].map((b) => b.textContent)).toEqual(['Get the Android app', 'Add a Google Timeline export'])
    expect(host.querySelector('.ob-drop')).toBeNull()
  })
})
