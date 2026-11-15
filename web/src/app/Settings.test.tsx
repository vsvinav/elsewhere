// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.hoisted(() => {
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof matchMedia
  // Node's own experimental localStorage global shadows jsdom's and has no setItem.
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) })
})
vi.mock('../ingest/keycheck', async (orig) => ({ ...(await orig<typeof import('../ingest/keycheck')>()), checkKey: async () => ({ ok: true }) }))
vi.mock('@vis.gl/react-google-maps', () => ({ APIProvider: ({ children }: { children: unknown }) => children, Map: () => null, useMap: () => null }))

import { Settings } from './Settings'
import { RecordContext, type Record_ } from './App'
import { settings } from '../ingest/settings'
import { profile } from '../profile/profile'

const rec: Record_ = { mine: true, stage: null, importError: null, enrichError: null, importFile() {}, reset: vi.fn(), editProfile() {} }
const mount = (fetchFn?: typeof fetch) => {
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  act(() => root.render(createElement(RecordContext.Provider, { value: rec }, createElement(Settings, { fetchFn }))))
  const flush = () => act(() => new Promise((r) => setTimeout(r, 10)))
  return { host, root, flush, unmount: () => act(() => root.unmount()) }
}
const input = (host: HTMLElement, id: string) => host.querySelector<HTMLInputElement>(`#${id}`)
const setValue = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}
const okFetch = (async () => Response.json({ choices: [{ message: { content: 'OK' } }] })) as unknown as typeof fetch

beforeEach(() => {
  settings.set({ mapsKey: '', mapId: '', keyOk: null, mapsOk: null, keyError: '', limited: false, llm: { provider: 'openai', key: '', model: '', baseUrl: '' }, relayUrl: 'https://relay.elsewhere.app' })
  profile.set({ name: 'V', units: 'km', homes: [], works: [] })
  document.body.innerHTML = ''
})

describe('Settings', () => {
  it('prints the five sections under the title', () => {
    const { host, unmount } = mount()
    expect(host.querySelector('h1')?.textContent).toBe('SETTINGS')
    expect([...host.querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['GOOGLE MAPS', 'ASK ELSEWHERE', 'CREW', 'UNITS', 'DATA'])
    expect(host.querySelector('label[for=st-map-id]')?.textContent).toBe('Map ID · optional')
    expect(host.querySelector('label[for=st-map-tiles]')?.textContent).toBe('Map provider')
    expect([...host.querySelectorAll('#st-map-tiles option')].map((o) => o.textContent)).toEqual(['Auto', 'Google', 'OpenStreetMap'])
    expect(host.textContent).toContain('Your key is stored in this browser only and is sent straight to the provider you choose.')
    for (const el of host.querySelectorAll('input:not([type=radio]), select')) expect(host.querySelector(`label[for="${el.id}"]`), `label for #${el.id}`).not.toBeNull()
    unmount()
  })

  it('Relay URL edits land in settings', () => {
    const { host, unmount } = mount()
    const el = input(host, 'st-relay')!
    expect(el.value).toBe('https://relay.elsewhere.app')
    act(() => { el.focus(); setValue(el, ' https://relay.example.org/ '); el.blur() })
    expect(settings.get().relayUrl).toBe('https://relay.example.org')
    unmount()
  })

  it('custom provider shows Base URL and makes the API key optional', () => {
    const { host, unmount } = mount()
    expect(host.querySelector('label[for=st-llm-key]')?.textContent).toBe('API key')
    expect(input(host, 'st-llm-base')).toBeNull()
    act(() => setValue(host.querySelector<HTMLSelectElement>('#st-llm-provider')!, 'custom'))
    expect(settings.get().llm.provider).toBe('custom')
    expect(host.querySelector('label[for=st-llm-key]')?.textContent).toBe('API key · optional')
    expect(input(host, 'st-llm-base')?.placeholder).toBe('http://localhost:11434/v1')
    expect(input(host, 'st-llm-model')?.placeholder).toBe('llama3.1')
    unmount()
  })

  it('Show toggle reveals the key', () => {
    const { host, unmount } = mount()
    const show = host.querySelector<HTMLButtonElement>('.show')!
    expect(show.getAttribute('aria-pressed')).toBe('false')
    expect(input(host, 'st-llm-key')?.type).toBe('password')
    act(() => show.click())
    expect(show.getAttribute('aria-pressed')).toBe('true')
    expect(input(host, 'st-llm-key')?.type).toBe('text')
    unmount()
  })

  it('TEST reports the connected model', async () => {
    const { host, flush, unmount } = mount(okFetch)
    act(() => setValue(input(host, 'st-llm-key')!, 'sk-1'))
    expect(settings.get().llm.key).toBe('sk-1')
    act(() => { [...host.querySelectorAll('button')].find((b) => b.textContent === 'Test')!.click() })
    await flush()
    expect(host.querySelector('[role=status]')?.textContent).toBe('Connected · gpt-4o-mini')
    unmount()
  })

  it('TEST without a key asks for one and makes no call', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch
    const { host, flush, unmount } = mount(fetchFn)
    act(() => { [...host.querySelectorAll('button')].find((b) => b.textContent === 'Test')!.click() })
    await flush()
    expect(host.querySelector('[role=status]')?.textContent).toBe('Add a key first')
    expect(fetchFn).not.toHaveBeenCalled()
    unmount()
  })

  it('TEST shows the provider error', async () => {
    const failing = (async () => new Response('', { status: 401 })) as unknown as typeof fetch
    const { host, flush, unmount } = mount(failing)
    act(() => setValue(input(host, 'st-llm-key')!, 'sk-bad'))
    act(() => { [...host.querySelectorAll('button')].find((b) => b.textContent === 'Test')!.click() })
    await flush()
    expect(host.querySelector('[role=status]')?.textContent).toBe('HTTP 401')
    unmount()
  })

  it('the Maps key saves on blur via settings.setKey', () => {
    const spy = vi.spyOn(settings, 'setKey')
    const { host, unmount } = mount()
    const key = input(host, 'st-maps-key')!
    act(() => { key.focus(); setValue(key, ' AIzaNew '); key.blur() })
    expect(spy).toHaveBeenCalledWith('AIzaNew')
    expect(settings.get().mapsKey).toBe('AIzaNew')
    spy.mockRestore(); unmount()
  })

  it('units write to the profile', () => {
    const { host, unmount } = mount()
    act(() => host.querySelector<HTMLInputElement>('input[type=radio][value=mi]')!.click())
    expect(profile.get()?.units).toBe('mi')
    unmount()
  })

  it('clearing asks first', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { host, unmount } = mount()
    act(() => { [...host.querySelectorAll('button')].find((b) => b.textContent === "Clear this browser's record")!.click() })
    expect(rec.reset).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    act(() => { [...host.querySelectorAll('button')].find((b) => b.textContent === "Clear this browser's record")!.click() })
    expect(rec.reset).toHaveBeenCalledTimes(1)
    confirm.mockRestore(); unmount()
  })
})
