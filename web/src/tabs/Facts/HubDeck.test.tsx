// @vitest-environment jsdom
vi.hoisted(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof matchMedia
  class IO { observe() {} disconnect() {} unobserve() {} }
  window.IntersectionObserver = IO as unknown as typeof IntersectionObserver
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k), clear: () => mem.clear() })
})
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { onThisDayData } from '../../test/onThisDay'
import { sampleData } from '../../test/sample'
import { DataContext } from '../../data/DataContext'
import { RecordContext, type Record_ } from '../../app/App'
import { useStore } from '../../store/useStore'
import { todaysFact } from '../../analytics/hub'
import type { Fact } from '../../analytics/facts'
import { HubDeck } from './HubDeck'
import { Facts } from './Facts'

vi.mock('../../world/PlacePhoto', () => ({ PlacePhoto: () => createElement('div') }))

const data = onThisDayData()
const TODAY = '2025-11-15'
const f = (id: string, kind: Fact['kind'], headline: string): Fact => ({ id, kind, headline, detail: `About ${id}.`, door: { kind: 'range', from: 0, to: 1, label: headline } })
const facts: Fact[] = [f('a', 'scale', 'Twice around the Earth'), f('b', 'record', 'Nine nights away'), f('c', 'habit', 'Out at 18:00'), f('d', 'explored', 'Four countries')]
const wrap = (ui: ReactNode, d = data) => render(<DataContext.Provider value={d}>{ui}</DataContext.Provider>)
const deck = () => screen.getByRole('listbox', { name: 'Play deck' })
const cards = () => within(deck()).getAllByRole('option')
const dots = () => Array.from(document.querySelectorAll('.dots i')).map((i) => i.classList.contains('on'))

beforeEach(() => { localStorage.clear(); location.hash = 'facts'; useStore.setState({ tab: 'facts', origin: null, focus: null, range: null, pin: null }) })
afterEach(cleanup)

describe('HubDeck', () => {
  it('deals six cards in order, each with its kind label, the first one selected', () => {
    wrap(<HubDeck data={data} raw={data} facts={facts} today={TODAY} units="km" onOpenKind={() => {}} onOpenPassport={() => {}} />)
    const all = cards()
    expect(all.map((c) => c.querySelector('.caps')!.textContent)).toEqual(['Today', 'On this day', 'Streaks', 'Passport', 'Compare', 'Rhythm'])
    expect(all.map((c) => c.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false', 'false', 'false'])
    expect(dots()).toEqual([true, false, false, false, false, false])
  })

  it("today's fact is the day's deterministic pick and OPEN asks for its kind", () => {
    const open = vi.fn()
    wrap(<HubDeck data={data} raw={data} facts={facts} today={TODAY} units="km" onOpenKind={open} onOpenPassport={() => {}} />)
    const pick = todaysFact(facts, TODAY)!
    const card = cards()[0]
    expect(within(card).getByRole('heading', { level: 3 }).textContent).toBe(pick.headline)
    expect(card.textContent).toContain(pick.detail)
    fireEvent.click(within(card).getByRole('button', { name: /^Open/ }))
    expect(open).toHaveBeenCalledWith(pick.kind)
  })

  it('on this day names the city and opens the map on that day', () => {
    wrap(<HubDeck data={data} raw={data} facts={facts} today={TODAY} units="km" onOpenKind={() => {}} onOpenPassport={() => {}} />)
    const card = cards()[1]
    expect(within(card).getByRole('heading', { level: 3 }).textContent).toBe('Paris')
    expect(card.textContent).toContain('15 Nov 2022 — you landed in Paris.')
    fireEvent.click(within(card).getByRole('button', { name: 'Open on the map' }))
    const s = useStore.getState()
    expect(s.tab).toBe('map')
    expect(s.origin?.label).toBe('On this day')
    expect(s.range![0]).toBeGreaterThanOrEqual(Date.UTC(2022, 10, 14) / 1000)
    expect(s.range![1]).toBeLessThanOrEqual(Date.UTC(2022, 10, 18) / 1000)
  })

  it('a record under a year old shows its farthest day without claiming it happened on this day', () => {
    const short = { ...data, meta: { ...data.meta, range: [Date.UTC(2023, 10, 11, 8) / 1000, Date.UTC(2024, 4, 1) / 1000] } } as typeof data
    wrap(<HubDeck data={short} raw={short} facts={facts} today="2024-04-10" units="km" onOpenKind={() => {}} onOpenPassport={() => {}} />)
    const card = cards()[1]
    expect(card.textContent).toContain('landed in Paris')
    expect(card.textContent).toContain("Your record starts 11 November — meanwhile, here's your farthest day so far.")
    expect(card.textContent).not.toContain('On this day, earlier this year')
  })

  it('streaks prints the longest run away, the weeks with something new, and the streak still running', () => {
    const open = vi.fn()
    wrap(<HubDeck data={data} raw={data} facts={facts} today={TODAY} units="km" onOpenKind={open} onOpenPassport={() => {}} />)
    const card = cards()[2]
    const rows = within(card).getAllByRole('listitem').map((r) => r.textContent)
    expect(rows[0]).toMatch(/^7Longest away streak/)
    expect(rows[1]).toMatch(/Weeks with a new place/)
    expect(rows[2]).toMatch(/^2Current away streaknights and counting/)
    fireEvent.click(within(card).getByRole('button', { name: /^Open/ }))
    expect(open).toHaveBeenCalledWith('record')
  })

  it('the passport card carries the booklet count and OPEN goes to the full booklet', () => {
    const open = vi.fn()
    wrap(<HubDeck data={data} raw={data} facts={facts} today={TODAY} units="km" onOpenKind={() => {}} onOpenPassport={open} />)
    const card = cards()[3]
    expect(card.querySelector('.passport.compact')).not.toBeNull()
    expect(card.textContent).toMatch(/Stamped\d+ \/ \d+/)
    fireEvent.click(within(card).getByRole('button', { name: 'Open passport' }))
    expect(open).toHaveBeenCalled()
  })

  it('compare years starts on the latest two and a tap on a chip cycles it past the other', () => {
    wrap(<HubDeck data={data} raw={data} facts={facts} today={TODAY} units="km" onOpenKind={() => {}} onOpenPassport={() => {}} />)
    const card = cards()[4]
    const chips = () => within(card).getAllByRole('button', { name: /^Compare year/ }).map((b) => b.textContent)
    expect(chips()).toEqual(['2024', '2025'])
    fireEvent.click(within(card).getByRole('button', { name: 'Compare year 2024' }))
    expect(chips()).toEqual(['2022', '2025'])
    fireEvent.click(within(card).getByRole('button', { name: 'Compare year 2025' }))
    expect(chips()).toEqual(['2022', '2023'])
    const nights = within(card).getByRole('row', { name: 'Nights away' })
    expect(nights.textContent).toBe('Nights away58')
  })

  it('rhythm shows the busiest hour over a mini grid and opens the habits', () => {
    const open = vi.fn()
    wrap(<HubDeck data={data} raw={data} facts={facts} today={TODAY} units="km" onOpenKind={open} onOpenPassport={() => {}} />)
    const card = cards()[5]
    expect(within(card).getByRole('heading', { level: 3 }).textContent).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d\d:00$/)
    expect(card.textContent).toMatch(/Busiest: (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d\d:00/)
    expect(card.querySelectorAll('.heat-mini i')).toHaveLength(7 * 24)
    fireEvent.click(within(card).getByRole('button', { name: /^Open/ }))
    expect(open).toHaveBeenCalledWith('habit')
  })

  it('the arrow keys and the dots move the selection along the deck', () => {
    wrap(<HubDeck data={data} raw={data} facts={facts} today={TODAY} units="km" onOpenKind={() => {}} onOpenPassport={() => {}} />)
    fireEvent.keyDown(deck(), { key: 'ArrowRight' })
    expect(cards()[1].getAttribute('aria-selected')).toBe('true')
    expect(dots()[1]).toBe(true)
    fireEvent.keyDown(deck(), { key: 'ArrowLeft' })
    fireEvent.keyDown(deck(), { key: 'ArrowLeft' })
    expect(cards()[0].getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Card 6 of 6' }))
    expect(cards()[5].getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Previous card' }))
    expect(cards()[4].getAttribute('aria-selected')).toBe('true')
  })

  it('a day with nothing on record prints a quiet card without a door', () => {
    const quiet = { ...data, visits: data.visits.filter((v) => v.place_id === 'sydney-hotel'), daily: data.daily.slice(0, 1) }
    wrap(<HubDeck data={quiet} raw={quiet} facts={facts} today={TODAY} units="km" onOpenKind={() => {}} onOpenPassport={() => {}} />, quiet)
    const card = cards()[1]
    expect(within(card).getByRole('heading', { level: 3 }).textContent).toBe('Quiet day')
    expect(within(card).queryByRole('button', { name: 'Open on the map' })).toBeNull()
  })
})

describe('Facts with the deck', () => {
  const sample = sampleData()
  const rec: Record_ = { mine: false, stage: null, importError: null, enrichError: null, importFile() {}, reset() {}, editProfile() {} }
  const wrapFacts = () => render(<RecordContext.Provider value={rec}><DataContext.Provider value={sample}><Facts /></DataContext.Provider></RecordContext.Provider>)

  it('keeps every fact behind an ALL FACTS disclosure, collapsed until asked', () => {
    wrapFacts()
    expect(deck()).toBeTruthy()
    const all = screen.getByRole('button', { name: /^All facts/ })
    expect(all.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelectorAll('.facts .fact-h')).toHaveLength(0)
    fireEvent.click(all)
    expect(all.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelectorAll('.facts .fact-h').length).toBeGreaterThan(3)
  })

  it("OPEN on today's fact unfolds the list filtered to that kind", () => {
    wrapFacts()
    const card = cards()[0]
    const kind = card.className.match(/kind-(\w+)/)![1]
    fireEvent.click(within(card).getByRole('button', { name: /^Open/ }))
    expect(screen.getByRole('button', { name: /^All facts/ }).getAttribute('aria-expanded')).toBe('true')
    const passes = document.querySelectorAll('.facts .pass.fact')
    expect(passes.length).toBeGreaterThan(0)
    for (const p of passes) expect(p.classList.contains(kind)).toBe(true)
    expect(screen.getByRole('button', { name: new RegExp(`^${kind}`, 'i') }).getAttribute('aria-pressed')).toBe('true')
  })
})
