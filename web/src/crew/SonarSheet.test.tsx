// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { screen, within } from '@testing-library/dom'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mem = new Map<string, unknown>()
const ls = new Map<string, string>()
vi.stubGlobal('localStorage', { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => ls.set(k, v), removeItem: (k: string) => ls.delete(k), clear: () => ls.clear() })
vi.mock('../ingest/db', () => ({
  kv: {
    get: async (k: string) => mem.get(k),
    set: async (k: string, v: unknown) => { mem.set(k, v) },
    setAll: async (entries: [string, unknown][]) => { for (const [k, v] of entries) mem.set(k, v) },
    del: async (k: string) => { mem.delete(k) },
  },
}))

import { SHEET_SEEN_LS, SNAP_TOGETHER, SonarSheet, resetSheetSeenForTest, sheetLine, sheetTitle } from './SonarSheet'
import { useCrew, type Friend, type Hit } from './friends'
import { usePhotos } from '../photos/store'

const marta: Friend = { deviceId: 'dev-b', name: 'Marta', signPub: '00', kxPub: '00', pairId: 'pair-1', pairKey: '00', addedAt: 0, grants: { liveCity: true, livePrecise: false, sonar: true } }
const t = Math.floor(Date.now() / 1000)
const fix = { pairId: 'pair-1', t, lat: 38.7223, lng: -9.1393, city: 'Lisbon', grade: 'sonar' as const, at: Date.now() }
const hitOf = (id: string, extra: Partial<Hit> = {}): Hit => ({ pairId: 'pair-1', id, at: Date.now(), ...extra })

const roots: Root[] = []
const mount = () => {
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host); roots.push(root)
  act(() => root.render(createElement(SonarSheet)))
  return host
}
const click = (el: Element) => act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)))
const sheet = () => screen.queryByRole('dialog', { name: 'Sonar' })
const raise = (h: Hit) => act(() => useCrew.setState({ hit: h, sheetHit: h }))

beforeEach(() => {
  mem.clear(); ls.clear(); resetSheetSeenForTest()
  document.body.innerHTML = ''
  usePhotos.setState({ photos: null })
  useCrew.setState({ friends: [marta], fixes: { 'pair-1': fix }, hit: null, sheetHit: null, sheetQuiet: {}, tag: null })
})
afterEach(() => { for (const r of roots.splice(0)) act(() => r.unmount()) })

describe('SonarSheet', () => {
  it('copy: the title names the friend; the line changes under rehearsal', () => {
    expect(sheetTitle('Marta')).toBe('Marta is within a mile')
    expect(sheetLine('Marta', false)).toBe('Neither of you is usually here. Say hi?')
    expect(sheetLine('Marta', true)).toBe('Rehearsal ping — Marta is within a mile.')
  })

  it('rises over the app from the sheet slot with the two actions, and for a test echo too', () => {
    mount()
    expect(sheet()).toBeNull()
    raise(hitOf('h1'))
    const s = sheet()!
    expect(s.querySelector('h2')?.textContent).toBe('Marta is within a mile')
    expect(s.querySelector('.rehearsal')).toBeNull()
    expect(s.textContent).toContain('Neither of you is usually here. Say hi?')
    expect(within(s).getByRole('button', { name: SNAP_TOGETHER })).toBeTruthy()
    expect(within(s).getByRole('button', { name: 'Dismiss' })).toBeTruthy()
    act(() => useCrew.setState({ sheetHit: null }))
    raise(hitOf('h-test', { test: true }))
    expect(sheet()!.querySelector('h2')?.textContent).toBe('Marta is within a mile')
  })

  it('a rehearsal hit carries its own flag: the tag sits by the title and the line says so', () => {
    mount()
    raise(hitOf('h2', { rehearsal: true }))
    const s = sheet()!
    expect(s.querySelector('h2 .rehearsal')?.textContent).toBe('REHEARSAL')
    expect(s.textContent).toContain('Rehearsal ping — Marta is within a mile.')
  })

  it('the sheet is not tied to the map note: clearing the hit leaves it up, Dismiss puts it away and remembers the id', () => {
    mount()
    raise(hitOf('h3'))
    act(() => useCrew.getState().clearHit())
    expect(sheet()).not.toBeNull()
    click(within(sheet()!).getByRole('button', { name: 'Dismiss' }))
    expect(sheet()).toBeNull()
    expect(useCrew.getState().sheetHit).toBeNull()
    expect(JSON.parse(ls.get(SHEET_SEEN_LS)!)).toEqual(['h3'])
  })

  it('Snap a photo together opens the camera, files the photo under the hit at the friend\'s fix with the caption prefilled, and the sheet waits for Dismiss', async () => {
    ls.set('photos:privacy', '1')
    const host = mount()
    raise(hitOf('h5'))
    const s = sheet()!
    const input = host.querySelector<HTMLInputElement>('input[type=file]') ?? document.body.querySelector<HTMLInputElement>('input[type=file]')!
    const picker = vi.spyOn(input, 'click').mockImplementation(() => {})
    click(within(s).getByRole('button', { name: SNAP_TOGETHER }))
    expect(picker).toHaveBeenCalledTimes(1)
    // The map note timing out mid-photo must not pull the camera away.
    act(() => useCrew.getState().clearHit())
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'shot.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)) })
    await flush()
    const modal = screen.getByRole('dialog', { name: 'Your photo' })
    expect(modal.querySelector<HTMLInputElement>('.snap-caption input')!.value).toBe('with Marta')
    const photo = usePhotos.getState().photos![0]
    expect(photo).toMatchObject({ caption: 'with Marta', city: 'Lisbon', lat: fix.lat, lng: fix.lng, placeId: 'sonar:h5' })
    expect(modal.querySelector('.photo-card .name')!.textContent).toBe('Lisbon')
    click(within(modal).getByText('Done'))
    expect(sheet()).not.toBeNull()
    click(within(sheet()!).getByRole('button', { name: 'Dismiss' }))
    expect(sheet()).toBeNull()
  })
})
