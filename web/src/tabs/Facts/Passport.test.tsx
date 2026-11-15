// @vitest-environment jsdom
vi.hoisted(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof matchMedia
  class IO { observe() {} disconnect() {} unobserve() {} }
  window.IntersectionObserver = IO as unknown as typeof IntersectionObserver
  // Node's own experimental localStorage global shadows jsdom's and has no setItem.
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k), clear: () => mem.clear() })
})
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { sampleData } from '../../test/sample'
import { DataContext } from '../../data/DataContext'
import { useStore } from '../../store/useStore'
import { earnedIds, passport } from '../../analytics/passport'
import { date } from '../../world/fmt'
import { Passport, SEEN_KEY } from './Passport'

const data = sampleData()
const pass = passport(data)
const wrap = (ui: ReactNode) => render(<DataContext.Provider value={data}>{ui}</DataContext.Provider>)
const page = (title: string) => screen.getByRole('group', { name: new RegExp(`^${title}, page`) })

beforeEach(() => { localStorage.clear(); useStore.setState({ tab: 'facts', origin: null, focus: null, range: null, pin: null }) })
afterEach(cleanup)

describe('Passport', () => {
  it('prints a page per country and one of milestones, with the stamped count', () => {
    wrap(<Passport />)
    expect(pass.pages.map((p) => p.title)).toEqual(['US', 'FR', 'MILESTONES'])
    for (const p of pass.pages) expect(page(p.title)).toBeTruthy()
    expect(screen.getByText('Page 1 of 3')).toBeTruthy()
    const total = pass.pages.reduce((a, p) => a + p.stamps.length, 0)
    expect(screen.getByText(`${earnedIds(pass).length} / ${total}`)).toBeTruthy()
  })

  it('an earned stamp carries its date and opens the beds through a places door', () => {
    wrap(<Passport />)
    const paris = pass.pages[1].stamps[0]
    const fr = page('FR')
    const stamp = within(fr).getByRole('button', { name: 'Open on the map: Paris' })
    expect(stamp.textContent).toContain(date(paris.earnedAt!))
    expect(stamp.textContent).toContain(paris.sub!)
    fireEvent.click(stamp)
    const s = useStore.getState()
    expect(s.tab).toBe('map')
    expect(s.focus?.ids).toEqual(paris.door && 'placeIds' in paris.door ? paris.door.placeIds : null)
    expect(s.origin).toMatchObject({ label: 'Paris', backTab: 'facts' })
  })

  it('an unearned stamp is a ghost outline that opens nothing', () => {
    wrap(<Passport />)
    const ms = page('MILESTONES')
    const ghost = within(ms).getByRole('button', { name: '1,000 NIGHTS AWAY: not yet' })
    expect(ghost.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(ghost)
    expect(useStore.getState().tab).toBe('facts')
    const earned = within(ms).getAllByRole('button', { name: /^Open on the map: / })
    expect(earned.map((b) => b.getAttribute('aria-label'))).toContain('Open on the map: FIRST NIGHT AWAY')
    expect(within(ms).getByText(`${earned.length} / ${pass.pages[2].stamps.length} earned`)).toBeTruthy()
  })

  it('arrow keys and the arrow buttons turn the pages', () => {
    wrap(<Passport />)
    const booklet = screen.getByRole('region', { name: 'Passport' })
    expect(page('US').getAttribute('aria-current')).toBe('page')
    fireEvent.keyDown(booklet, { key: 'ArrowRight' })
    expect(screen.getByText('Page 2 of 3')).toBeTruthy()
    expect(page('FR').getAttribute('aria-current')).toBe('page')
    expect(page('US').getAttribute('aria-current')).toBeNull()
    fireEvent.keyDown(booklet, { key: 'ArrowLeft' })
    expect(screen.getByText('Page 1 of 3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('Page 3 of 3')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('a long booklet lands on the right page: pages scroll into view and the index is read from their offsets', () => {
    // Nine extra countries on top of the sample's two make eleven pages with the milestones.
    const D = 86400, base = data.visits[0].start - 400 * D
    const extra = Array.from({ length: 9 }, (_, i) => ({ id: `z${i}`, city: `Zone ${i}`, cc: `Z${i}`, lat: 10 + i, lng: -60 + 15 * i }))
    const long = {
      ...data,
      places: { ...data.places, ...Object.fromEntries(extra.map((e) => [e.id, { lng: e.lng, lat: e.lat, role: null, city: e.city, country_code: e.cc, n_visits: 1, first_ts: base, last_ts: base, name: null, total_hours: 1 }])) },
      visits: [...extra.map((e, i) => ({ id: 9000 + i, start: base + i * 10 * D, end: base + i * 10 * D + 2 * D, tz: 0, place_id: e.id, lat: e.lat, lng: e.lng, type: 'UNKNOWN', p: 1, lvl: 0 })), ...data.visits],
    } as typeof data
    const n = passport(long).pages.length
    expect(n).toBeGreaterThanOrEqual(10)
    render(<DataContext.Provider value={long}><Passport /></DataContext.Provider>)
    const pages = document.querySelector('.passport-pages') as HTMLDivElement
    const leaves = Array.from(pages.querySelectorAll<HTMLElement>('.passport-leaf'))
    const W = 400, GAP = 24
    Object.defineProperty(pages, 'clientWidth', { value: W, configurable: true })
    const seen: number[] = []
    leaves.forEach((leaf, i) => {
      Object.defineProperty(leaf, 'offsetLeft', { value: i * (W + GAP), configurable: true })
      leaf.scrollIntoView = vi.fn(() => seen.push(i))
    })
    for (let i = 1; i < n; i++) fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(seen).toEqual(Array.from({ length: n - 1 }, (_, i) => i + 1))
    expect(leaves[n - 1].scrollIntoView).toHaveBeenLastCalledWith(expect.objectContaining({ inline: 'start' }))
    // the browser settles on the last page: its offset, not a multiple of the width, is what the booklet must read
    Object.defineProperty(pages, 'scrollLeft', { value: (n - 1) * (W + GAP), configurable: true })
    fireEvent.scroll(pages)
    expect(screen.getByText(`Page ${n} of ${n}`)).toBeTruthy()
    Object.defineProperty(pages, 'scrollLeft', { value: 4 * (W + GAP) + 30, configurable: true })
    fireEvent.scroll(pages)
    expect(screen.getByText(`Page 5 of ${n}`)).toBeTruthy()
  })

  it('the first open records every earned stamp without a thud; a new earn thuds once and is then recorded', async () => {
    vi.useFakeTimers()
    try {
      const { unmount } = wrap(<Passport />)
      expect(JSON.parse(localStorage.getItem(SEEN_KEY)!)).toEqual(earnedIds(pass))
      expect(document.querySelectorAll('.pstamp.thud')).toHaveLength(0)
      unmount()
      // Forget Paris: it reads as newly earned on the next open.
      localStorage.setItem(SEEN_KEY, JSON.stringify(earnedIds(pass).filter((id) => id !== 'city:Paris')))
      wrap(<Passport />)
      const thuds = document.querySelectorAll('.pstamp.thud')
      expect(thuds).toHaveLength(1)
      expect(thuds[0].getAttribute('aria-label')).toBe('Open on the map: Paris')
      expect(JSON.parse(localStorage.getItem(SEEN_KEY)!)).toEqual(earnedIds(pass))
      await act(async () => { vi.advanceTimersByTime(400) })
      expect(document.querySelectorAll('.pstamp.thud')).toHaveLength(0)
    } finally { vi.useRealTimers() }
  })

  it('reduced motion persists without animating', () => {
    const mm = window.matchMedia
    window.matchMedia = (() => ({ matches: true, addEventListener() {}, removeEventListener() {} })) as unknown as typeof matchMedia
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([]))
      wrap(<Passport />)
      expect(document.querySelectorAll('.pstamp.thud')).toHaveLength(0)
      expect(JSON.parse(localStorage.getItem(SEEN_KEY)!)).toEqual(earnedIds(pass))
    } finally { window.matchMedia = mm }
  })
})
