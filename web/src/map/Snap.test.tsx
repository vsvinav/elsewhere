// @vitest-environment jsdom
vi.hoisted(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { screen, within } from '@testing-library/dom'
import { DataContext } from '../data/DataContext'
import { sampleData } from '../test/sample'
import { useStore } from '../store/useStore'
import { usePhotos } from '../photos/store'
import { placeName } from '../analytics/home'

const mem = new Map<string, unknown>()
const ls = new Map<string, string>()
// Node's own experimental localStorage global shadows jsdom's and has no setItem.
vi.stubGlobal('localStorage', { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => ls.set(k, v), removeItem: (k: string) => ls.delete(k), clear: () => ls.clear() })
vi.mock('../ingest/db', () => ({
  kv: {
    get: async (k: string) => mem.get(k),
    set: async (k: string, v: unknown) => { mem.set(k, v) },
    setAll: async (entries: [string, unknown][]) => { for (const [k, v] of entries) mem.set(k, v) },
    del: async (k: string) => { mem.delete(k) },
  },
}))
vi.mock('../world/PlacePhoto', () => ({ PlacePhoto: () => createElement('div', { className: 'photo' }) }))
vi.mock('../ingest/places', () => ({ need: () => {} }))

import { PinHud } from './Pins'

const data = sampleData()
const click = (el: Element) => act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)))

beforeEach(() => {
  mem.clear(); localStorage.clear()
  usePhotos.setState({ photos: null })
  useStore.setState({ heat: false, pin: 'cafe', hiddenCats: [] })
})

describe('SNAP on an open pin', () => {
  it('opens the camera input after the privacy sheet, prints the card, and delete empties the strip', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    const root = createRoot(host)
    act(() => root.render(createElement(DataContext.Provider, { value: data }, createElement(PinHud))))
    await flush()
    const card = host.querySelector<HTMLElement>('.pin-card')!
    expect(card).not.toBeNull()
    const input = card.parentElement!.querySelector<HTMLInputElement>('input[type=file]')!
    expect(input.getAttribute('accept')).toBe('image/*')
    expect(input.getAttribute('capture')).toBe('environment')
    const picker = vi.spyOn(input, 'click').mockImplementation(() => {})

    // First snap: the sheet says where photos go, then the camera opens.
    click(within(card).getByRole('button', { name: 'Snap a photo here' }))
    const sheet = screen.getByRole('dialog', { name: 'Before your first snap' })
    expect(sheet.textContent).toContain('Photos stay on this device')
    expect(picker).not.toHaveBeenCalled()
    click(within(sheet).getByText('Got it, open the camera'))
    expect(picker).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('photos:privacy')).toBe('1')

    // A picture comes back from the camera.
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'shot.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    vi.useFakeTimers({ now: Date.UTC(2025, 10, 15, 12), toFake: ['Date'] })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)) })
    vi.useRealTimers()
    await flush()

    const modal = screen.getByRole('dialog', { name: 'Your photo' })
    const name = placeName(data.places.cafe, 'cafe')
    expect(modal.querySelector('.photo-card .name')!.textContent).toBe(name)
    expect(modal.querySelector('.photo-card .stamp b')!.textContent).toBe('15')
    expect(modal.querySelector('.photo-card .stamp')!.textContent).toContain('NOV 2025')
    expect(modal.querySelector('.photo-card .barcode .code')!.textContent).toBe('PHO 20251115 CAFE')
    expect(modal.querySelector<HTMLImageElement>('.photo-card .shot')!.src.startsWith('blob:')).toBe(true)
    expect(usePhotos.getState().photos!.length).toBe(1)
    expect(usePhotos.getState().photos![0].placeId).toBe('cafe')

    // The strip on the pin shows it; second snap goes straight to the camera.
    click(within(modal).getByText('Done'))
    await flush()
    expect(host.querySelectorAll('.pin-card .photo-thumb').length).toBe(1)
    click(within(card).getByRole('button', { name: 'Snap a photo here' }))
    expect(picker).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('dialog')).toBeNull()

    click(within(card).getByRole('button', { name: 'Delete photo' }))
    await flush()
    expect(host.querySelectorAll('.pin-card .photo-thumb').length).toBe(0)
    expect(usePhotos.getState().photos).toEqual([])
    expect([...mem.keys()].filter((k) => k.startsWith('photo:'))).toEqual([])
    act(() => root.unmount())
    host.remove()
  })
})
