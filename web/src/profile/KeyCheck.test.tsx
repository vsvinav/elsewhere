// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const probe = vi.hoisted(() => {
  // Node's own experimental localStorage global shadows jsdom's and has no setItem.
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) })
  return { ok: true as boolean, map: null as null | { onTilesLoaded?: () => void } }
})
vi.mock('../ingest/keycheck', async (orig) => ({ ...(await orig<typeof import('../ingest/keycheck')>()), checkKey: async () => (probe.ok ? { ok: true } : { ok: false, message: 'API key not valid.', hint: null }) }))
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children: unknown }) => children,
  Map: (props: { onTilesLoaded?: () => void }) => { probe.map = props; return createElement('div', { className: 'probe-map' }) },
}))

import { KeyCheck, useKeyGate } from './KeyCheck'
import { settings } from '../ingest/settings'
import { markGoogleDown } from '../map/provider'

function Gate() { return createElement('b', null, useKeyGate() ? 'gated' : 'open') }
const mount = () => {
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  act(() => root.render(createElement('div', null, createElement(KeyCheck), createElement(Gate))))
  return { host, root, flush: () => act(() => new Promise((r) => setTimeout(r, 10))) }
}
beforeEach(() => { probe.map = null; settings.set({ mapsKey: 'AIza', keyOk: null, mapsOk: null, keyError: '', limited: false }) })

describe('KeyCheck', () => {
  it('accepts once Places answers and the probe map draws tiles', async () => {
    probe.ok = true
    const { host, root, flush } = mount()
    expect(host.textContent).toContain('gated')
    await flush()
    expect(host.textContent).toMatch(/Places ✓ · Maps…/)
    expect(host.querySelector('.probe-map')).not.toBeNull()
    act(() => probe.map!.onTilesLoaded!())
    expect(host.textContent).toMatch(/Key accepted · Places ✓ · Maps ✓/)
    expect(host.textContent).toContain('open')
    expect(settings.get().mapsOk).toBe(true)
    act(() => root.unmount())
    // A persisted verdict is not probed again.
    const again = mount()
    expect(again.host.querySelector('.probe-map')).toBeNull()
    act(() => again.root.unmount())
  })
  it('skips the probe map when Places already refused', async () => {
    probe.ok = false
    const { host, root, flush } = mount()
    await flush()
    expect(host.querySelector('.probe-map')).toBeNull()
    expect(host.textContent).toContain('Places API refused')
    expect(host.textContent).toContain('API key not valid.')
    act(() => root.unmount())
  })
  it('refuses with Google’s reason when the probe map reports an error', async () => {
    probe.ok = true
    const { host, root, flush } = mount()
    await flush()
    act(() => markGoogleDown('OverQuotaMapError'))
    await flush()
    expect(host.textContent).toContain('Maps JavaScript refused')
    expect(host.textContent).toContain('The key hit a daily quota or budget cap you set in Google Cloud.')
    expect(host.textContent).toContain('OverQuotaMapError')
    expect(host.textContent).toContain('gated')
    expect(settings.get().mapsOk).toBe(false)
    act(() => root.unmount())
  })
})
