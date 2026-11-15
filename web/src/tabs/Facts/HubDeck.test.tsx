// @vitest-environment jsdom
vi.hoisted(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof matchMedia
  class IO { observe() {} disconnect() {} unobserve() {} }
  window.IntersectionObserver = IO as unknown as typeof IntersectionObserver
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k), clear: () => mem.clear() })
})
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
  it('deals five cards in order, each with its kind label, the first one selected, and no On this day card', () => {
    wrap(<HubDeck data={data} facts={facts} today={TODAY} units="km" onOpenKind={() => {}} onOpenPassport={() => {}} />)
    const all = cards()
    expect(all.map((c) => c.querySelector('.caps')!.textContent)).toEqual(['Today', 'Streaks', 'Passport', 'Compare', 'Rhythm'])
    expect(all.map((c) => c.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false', 'false'])
    expect(dots()).toEqual([true, false, false, false, false])
    expect(screen.queryByText('On this day')).toBeNull()
  })

  it("today's fact is the day's deterministic pick and OPEN asks for its kind", () => {
    const open = vi.fn()
    wrap(<HubDeck data={data} facts={facts} today={TODAY} units="km" onOpenKind={open} onOpenPassport={() => {}} />)
    const pick = todaysFact(facts, TODAY)!
    const card = cards()[0]
    expect(within(card).getByRole('heading', { level: 3 }).textContent).toBe(pick.headline)
    expect(card.textContent).toContain(pick.detail)
    fireEvent.click(within(card).getByRole('button', { name: /^Open/ }))
    expect(open).toHaveBeenCalledWith(pick.kind)
  })

  it('streaks prints the longest run away, the weeks with something new, and the streak still running', () => {
    const open = vi.fn()
    wrap(<HubDeck data={data} facts={facts} today={TODAY} units="km" onOpenKind={open} onOpenPassport={() => {}} />)
    const card = cards()[1]
    const rows = within(card).getAllByRole('listitem').map((r) => r.textContent)
    expect(rows[0]).toMatch(/^7Longest away streak/)
    expect(rows[1]).toMatch(/Weeks with a new place/)
    expect(rows[2]).toMatch(/^2Current away streaknights and counting/)
    fireEvent.click(within(card).getByRole('button', { name: /^Open/ }))
    expect(open).toHaveBeenCalledWith('record')
  })

  it('the passport card carries the booklet count and OPEN goes to the full booklet', () => {
    const open = vi.fn()
    wrap(<HubDeck data={data} facts={facts} today={TODAY} units="km" onOpenKind={() => {}} onOpenPassport={open} />)
    const card = cards()[2]
    expect(card.querySelector('.passport.compact')).not.toBeNull()
    expect(card.textContent).toMatch(/Stamped\d+ \/ \d+/)
    fireEvent.click(within(card).getByRole('button', { name: 'Open passport' }))
    expect(open).toHaveBeenCalled()
  })

  it('compare years starts on the latest two and a tap on a chip cycles it past the other', () => {
    wrap(<HubDeck data={data} facts={facts} today={TODAY} units="km" onOpenKind={() => {}} onOpenPassport={() => {}} />)
    const card = cards()[3]
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
    wrap(<HubDeck data={data} facts={facts} today={TODAY} units="km" onOpenKind={open} onOpenPassport={() => {}} />)
    const card = cards()[4]
    expect(within(card).getByRole('heading', { level: 3 }).textContent).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d\d:00$/)
    expect(card.textContent).toMatch(/Busiest: (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d\d:00/)
    expect(card.querySelectorAll('.heat-mini i')).toHaveLength(7 * 24)
    fireEvent.click(within(card).getByRole('button', { name: /^Open/ }))
    expect(open).toHaveBeenCalledWith('habit')
  })

  it('the arrow keys and the dots move the selection along the deck', () => {
    wrap(<HubDeck data={data} facts={facts} today={TODAY} units="km" onOpenKind={() => {}} onOpenPassport={() => {}} />)
    fireEvent.keyDown(deck(), { key: 'ArrowRight' })
    expect(cards()[1].getAttribute('aria-selected')).toBe('true')
    expect(dots()[1]).toBe(true)
    fireEvent.keyDown(deck(), { key: 'ArrowLeft' })
    fireEvent.keyDown(deck(), { key: 'ArrowLeft' })
    expect(cards()[0].getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Card 5 of 5' }))
    expect(cards()[4].getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Previous card' }))
    expect(cards()[3].getAttribute('aria-selected')).toBe('true')
  })
})

describe('Facts with the deck', () => {
  const sample = sampleData()
  const rec: Record_ = { mine: false, stage: null, importError: null, enrichError: null, importFile() {}, reset() {}, editProfile() {} }
  const wrapFacts = () => render(<RecordContext.Provider value={rec}><DataContext.Provider value={sample}><Facts /></DataContext.Provider></RecordContext.Provider>)

  it('prints On this day full width above the Fun Facts hero, the deck under a PLAY label, and every pass in the open', () => {
    wrapFacts()
    const slot = document.querySelector('main.highlights')!
    const hero = document.querySelector<HTMLElement>('main.facts-head')!
    const play = document.querySelector<HTMLElement>('main.facts-play')!
    const list = document.querySelector('main.facts')!
    expect(slot).not.toBeNull()
    expect(slot.compareDocumentPosition(hero) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(hero.compareDocumentPosition(play) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(play.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(hero).getByRole('heading', { level: 1 }).textContent).toBe('FunFacts')
    expect(play.contains(deck())).toBe(true)
    expect(within(play).getByText('Play')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^All facts/ })).toBeNull()
    expect(document.querySelectorAll('.facts .fact-h').length).toBeGreaterThan(3)
  })

  it('the hero turns one quip at a time every six seconds, holds under the pointer, and the arrows step it', () => {
    vi.useFakeTimers()
    try {
      wrapFacts()
      const quip = () => document.querySelector('.feature-card .quip')!.textContent
      const count = () => document.querySelector('.feature-top .field')!.textContent
      const first = quip()
      expect(count()).toMatch(/1 of \d+$/)
      act(() => { vi.advanceTimersByTime(6000) })
      const second = quip()
      expect(second).not.toBe(first)
      expect(count()).toMatch(/2 of \d+$/)
      fireEvent.pointerEnter(document.querySelector('.feature') as HTMLElement)
      act(() => { vi.advanceTimersByTime(12000) })
      expect(quip()).toBe(second)
      fireEvent.pointerLeave(document.querySelector('.feature') as HTMLElement)
      fireEvent.click(screen.getByRole('button', { name: 'Previous fact' }))
      expect(quip()).toBe(first)
      fireEvent.click(screen.getByRole('button', { name: 'Next fact' }))
      expect(quip()).toBe(second)
      expect(screen.getByRole('button', { name: 'Shuffle' })).toBeTruthy()
    } finally { vi.useRealTimers() }
  })

  it('the kind chips in the hero foot filter the list below', () => {
    wrapFacts()
    const chips = within(screen.getByRole('group', { name: 'Show only' })).getAllByRole('button')
    expect(chips.length).toBeGreaterThan(1)
    fireEvent.click(chips[1])
    expect(chips[1].getAttribute('aria-pressed')).toBe('true')
    const kind = chips[1].textContent!.replace(/\s*\d+$/, '').toLowerCase()
    const passes = document.querySelectorAll('.facts .pass.fact')
    expect(passes.length).toBeGreaterThan(0)
    for (const p of passes) expect(p.classList.contains(kind)).toBe(true)
  })

  it("OPEN on today's fact filters the list to that kind", () => {
    wrapFacts()
    const card = cards()[0]
    const kind = card.className.match(/kind-(\w+)/)![1]
    fireEvent.click(within(card).getByRole('button', { name: /^Open/ }))
    const passes = document.querySelectorAll('.facts .pass.fact')
    expect(passes.length).toBeGreaterThan(0)
    for (const p of passes) expect(p.classList.contains(kind)).toBe(true)
    expect(screen.getByRole('button', { name: new RegExp(`^${kind}`, 'i') }).getAttribute('aria-pressed')).toBe('true')
  })
})
