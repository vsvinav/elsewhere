// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
vi.hoisted(() => {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) })
})
vi.mock('../ingest/db', () => ({ kv: { get: async () => undefined, set: async () => {}, del: async () => {} } }))

import { FriendTag, SONAR_BODY, SonarNote, TEST_BODY } from './MapBits'
import { useCrew, type Friend } from './friends'
import { profile } from '../profile/profile'

const NOW = Date.now()
const marta: Friend = { deviceId: 'M', name: 'Marta', signPub: '', kxPub: '', pairId: 'P', pairKey: '', addedAt: 0, grants: { liveCity: true, livePrecise: false, sonar: true } }
const fix = { pairId: 'P', t: Math.floor(NOW / 1000) - 180, lat: 38.7, lng: -9.1, city: 'Lisbon', grade: 'city' as const, at: NOW }

const mount = (el: ReturnType<typeof createElement>) => {
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  act(() => root.render(el))
  return { host, unmount: () => act(() => root.unmount()) }
}

beforeEach(() => {
  document.body.innerHTML = ''
  profile.set({ name: 'Ana', units: 'km', homes: [{ lat: 38.7, lng: -9.1, city: 'Lisbon', cc: 'PT', from: 0, to: null }], works: [] })
  useCrew.setState({ loaded: true, friends: [marta], fixes: { P: fix }, hit: null, tag: null })
})

describe('FriendTag', () => {
  it('shows the tapped friend, the shared city, and closes', () => {
    const { host, unmount } = mount(createElement(FriendTag))
    expect(host.querySelector('.friend-tag')).toBeNull()
    act(() => useCrew.getState().setTag('P'))
    expect(host.querySelector('.friend-tag .line')?.textContent).toBe('Marta · Lisbon · 3 min ago')
    expect(host.querySelector('.friend-tag .both')?.textContent).toBe("You're both in Lisbon")
    act(() => host.querySelector<HTMLButtonElement>('.friend-tag button')!.click())
    expect(useCrew.getState().tag).toBeNull()
    unmount()
  })
})

describe('SonarNote', () => {
  it('appears on a hit with the friend named, and Mute for today silences that friend', async () => {
    const { host, unmount } = mount(createElement(SonarNote))
    expect(host.querySelector('.sonar-note')).toBeNull()
    act(() => useCrew.setState({ hit: { pairId: 'P', id: 'P:1', at: NOW } }))
    expect(host.querySelector('.sonar-note h3')?.textContent).toBe('Sonar · Marta is nearby')
    expect(host.querySelector('.sonar-note p')?.textContent).toBe(SONAR_BODY)
    await act(async () => { host.querySelector<HTMLButtonElement>('.sonar-note .mute')!.click() })
    expect(useCrew.getState().friends[0].mutedUntil).toBeGreaterThan(NOW)
    expect(host.querySelector('.sonar-note')).toBeNull()
    unmount()
  })
  it('a test hit says so', () => {
    const { host, unmount } = mount(createElement(SonarNote))
    act(() => useCrew.setState({ hit: { pairId: 'P', id: 'ab12cd34', at: NOW, test: true } }))
    expect(host.querySelector('.sonar-note h3')?.textContent).toBe('Sonar · Test ping from Marta')
    expect(host.querySelector('.sonar-note p')?.textContent).toBe(TEST_BODY)
    unmount()
  })
})
