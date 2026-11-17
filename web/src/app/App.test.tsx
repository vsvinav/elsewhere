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
  return { kv: { get: async (k: string) => m.get(k), set: async (k: string, v: unknown) => { m.set(k, v) }, setAll: async (e: [string, unknown][]) => { for (const [k, v] of e) m.set(k, v) }, del: async (k: string) => { m.delete(k) } } }
})
const bundle = vi.hoisted(() => ({ missing: false, delay: 0 }))
vi.mock('../data/load', async (orig) => {
  const real = await orig<typeof import('../data/load')>()
  return { ...real, loadData: async () => { if (bundle.delay) await new Promise((r) => setTimeout(r, bundle.delay)); const mine = await real.loadData().catch(() => null); if (mine) return mine; if (bundle.missing) throw new real.DataLoadError('/data/record.json', '404'); return sampleData() }, loadPaths: async () => [] }
})
// No worker under jsdom: derivation runs inline on the sample cities, through the same synced-stays merge the app uses.
vi.mock('../ingest', async (orig) => {
  const real = await orig<typeof import('../ingest')>()
  const { buildData } = await import('../ingest/derive')
  const { sampleCities } = await import('../test/sample')
  const { hasSyncedStays } = await import('../sync/local')
  const rederive: typeof real.rederive = async (d, prof) => buildData(await real.withSyncedStays(real.parsedFromData(d)), sampleCities, { file: d.meta.source_file, sha256: d.meta.source_sha256 }, prof)
  const recordFromSyncedStays: typeof real.recordFromSyncedStays = async (prof, onStage) => { if (!(await hasSyncedStays())) return null; const base = real.emptyRecord(); const d = await rederive(base, prof, onStage); await real.saveRecord(d, real.parsedFromData(base)); return d }
  return { ...real, ingestFile: async () => { throw new Error('no') }, rederive, recordFromSyncedStays }
})
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
import { clearRecord } from '../ingest'
import { b64 } from '../crew/keys'
import { SYNC_KEY_KV } from '../account/driveKey'
import { resetSyncForTest, useSync } from '../sync/store'
import { importSource, monthOf, sealBlob, stayId } from '../sync/wire'

const ses = { session: 's', id: 'acct_1', email: 'v@example.org' }
const realFetch = globalThis.fetch
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
  resetSyncForTest()
  await clearRecord()
  bundle.missing = false; bundle.delay = 0
})
afterEach(() => { for (const r of roots.splice(0)) act(() => r.unmount()); globalThis.fetch = realFetch })

describe('a second browser', () => {
  const KEY = new Uint8Array(32).fill(7)
  const stay = { id: stayId('d_phone', 1700000000), lat: 48.86, lng: 2.35, name: 'Café de Flore', start: 1700000000, end: 1700003600 }
  const service = () => {
    const blob = sealBlob(KEY, 'd_phone:2023-11', { v: 1, stays: [stay] }, 500)
    const calls: string[] = []
    globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
      const path = new URL(url).pathname; calls.push(`${init.method ?? 'GET'} ${path}`)
      if (path === '/sync') return Response.json([{ key: 'd_phone:2023-11', ts: 500, size: 1 }])
      if (path === '/sync/d_phone%3A2023-11') return Response.json(blob)
      return new Response(null, { status: 204 })
    }) as unknown as typeof fetch
    return calls
  }
  const signedInWithKey = async () => { await kv.set(ACCOUNT_KV.session, ses); await kv.set(ACCOUNT_KV.driveKeyed, true); await kv.set(SYNC_KEY_KV, b64(KEY)) }

  it('with nothing imported, the stays pulled on sign-in become the record and the tour prints on them', async () => {
    bundle.missing = true
    await signedInWithKey()
    const calls = service()
    const host = await mount()
    expect(calls).toContain('GET /sync/d_phone%3A2023-11')
    expect(useSync.getState().status).toMatchObject({ kind: 'idle' })
    const saved = await kv.get<{ visits: { place_id: string }[]; places: Record<string, { label: string | null }> }>('record')
    expect(saved?.visits.map((v) => v.place_id)).toEqual([`sync:${stay.id}`])
    expect(saved?.places[`sync:${stay.id}`].label).toBe('Café de Flore')
    expect(host.querySelector('.tourline')).not.toBeNull()
    expect(host.textContent).not.toContain('Your phone keeps the record.')
    expect(host.textContent).toContain('Start over')
  })
  it('the first round waits for the record on this device, so what was not pushed last time goes up now', async () => {
    bundle.delay = 40
    await signedInWithKey()
    const own = sampleData()
    await kv.set('record', own)
    const calls = service()
    const host = await mount()
    await act(() => new Promise((r) => setTimeout(r, 80)))
    expect(host.textContent).toContain('Start over')
    const src = importSource(own.meta.source_sha256)
    expect(calls.filter((c) => c.startsWith('PUT /sync/'))).toContain(`PUT /sync/${encodeURIComponent(`${src}:${monthOf(own.visits[0].start)}`)}`)
  })
  it('a device that has never been welcomed goes straight through to its synced record, not to Welcome or onboarding', async () => {
    bundle.missing = true
    await kv.del(ACCOUNT_KV.welcomed)
    await signedInWithKey()
    service()
    const host = await mount()
    expect(host.textContent).not.toContain(WELCOME_LINE)
    expect(host.querySelector('.ob-drop, .ob-actions')).toBeNull()
    expect(host.querySelector('.tourline')).not.toBeNull()
  })
})

describe('the way back to Welcome', () => {
  it('signed out, the header carries a Log in chip that opens the welcome screen; Not now returns to the tour', async () => {
    const host = await mount()
    expect(host.querySelector('.tourline')).not.toBeNull()
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
