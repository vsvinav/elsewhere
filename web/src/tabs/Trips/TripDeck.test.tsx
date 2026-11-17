// @vitest-environment jsdom
vi.hoisted(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof matchMedia
  class IO { observe() {} disconnect() {} unobserve() {} }
  window.IntersectionObserver = IO as unknown as typeof IntersectionObserver
})
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createElement } from 'react'
import { sampleData } from '../../test/sample'
import { DataContext } from '../../data/DataContext'
import { useStore } from '../../store/useStore'
import type { Trip } from '../../data/types'
import { Trips } from './Trips'
import { compare, deckCards } from './deck'

vi.mock('../../world/TripMap', () => ({ TripMap: () => createElement('div', { 'data-testid': 'tripmap' }) }))
vi.mock('../../world/PlacePhoto', () => ({ PlacePhoto: () => createElement('div') }))

const base = sampleData()
const D = 86400, start = Date.UTC(2024, 4, 10) / 1000
const lisbon: Trip = { start, end: start + 7 * D, nights: 7, anchor_cities: ['Lisbon', 'Sintra'], total_km_by_mode: { FLYING: 10_000, IN_TRAIN: 300, IN_PASSENGER_VEHICLE: 40 }, max_dist_from_home_km: 5180, memory: null }
const data = { ...base, trips: [...base.trips, lisbon] }
const wrap = () => render(<DataContext.Provider value={data}><Trips /></DataContext.Provider>)
const deck = () => screen.getByRole('listbox', { name: 'Trip deck' })
const cards = () => within(deck()).getAllByRole('option')

beforeEach(() => { location.hash = 'trips'; useStore.setState({ tab: 'trips', origin: null, focus: null, range: null, pin: null }) })
afterEach(cleanup)

describe('TripDeck', () => {
  it('deals one card per trip, newest first, the first one selected', () => {
    wrap()
    const all = cards()
    expect(all).toHaveLength(3)
    expect(all[0].getAttribute('aria-selected')).toBe('true')
    expect(all[0].textContent).toContain('Lisbon → Sintra')
    expect(within(all[0]).getAllByTestId('tripmap')).toHaveLength(1)
  })

  it('the arrow keys move the selection along the deck', () => {
    wrap()
    fireEvent.keyDown(deck(), { key: 'ArrowRight' })
    expect(cards().map((c) => c.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
    fireEvent.keyDown(deck(), { key: 'ArrowRight' })
    fireEvent.keyDown(deck(), { key: 'ArrowRight' })
    expect(cards()[2].getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(deck(), { key: 'ArrowLeft' })
    expect(cards()[1].getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Previous trip' }))
    expect(cards()[0].getAttribute('aria-selected')).toBe('true')
  })

  it('a card ticks the stats where it beats the older card beside it', () => {
    wrap()
    const all = cards(), model = deckCards(data)
    const wins = (i: number) => (model[i + 1] ? Object.values(compare(model[i], model[i + 1])).filter((s) => s > 0).length : 0)
    expect(wins(1)).toBeGreaterThan(0)
    all.forEach((card, i) => expect(within(card).queryAllByLabelText('Beats the trip before')).toHaveLength(wins(i)))
    expect(within(all[2]).queryAllByLabelText('Beats the trip before')).toHaveLength(0)
  })

  it('search narrows the deck and the passes below, and says so when nothing matches', () => {
    wrap()
    const box = screen.getByRole('searchbox', { name: 'Search trips' })
    fireEvent.change(box, { target: { value: 'lisbon' } })
    expect(cards()).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: / pass · / })).toHaveLength(1)
    fireEvent.change(box, { target: { value: 'lisbon 2023' } })
    expect(within(deck()).queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText('No trips match')).toBeTruthy()
  })

  it('tapping a card opens its pass below', () => {
    wrap()
    const target = cards()[1]
    const title = within(target).getByRole('heading').textContent!
    fireEvent.click(within(target).getByRole('button', { name: `Open trip ${title}` }))
    const passes = screen.getAllByRole('button', { name: / pass · / })
    expect(passes.map((p) => p.getAttribute('aria-expanded'))).toEqual(['false', 'true', 'false'])
  })

  it('an open pass names each mode in plain words, not the raw constant', () => {
    wrap()
    fireEvent.click(screen.getByRole('button', { name: /^Open pass · Lisbon/ }))
    const bars = document.querySelector('.bars')!
    const labs = [...bars.querySelectorAll('.lab')].map((el) => el.textContent)
    expect(labs).toEqual(['Flight', 'Train', 'Car'])
    expect(document.body.textContent).not.toMatch(/FLYING|IN_TRAIN|IN_PASSENGER_VEHICLE/)
  })

  it('unmapped modes share a single Other bar', () => {
    const odd: Trip = { ...lisbon, start: start + 30 * D, end: start + 32 * D, nights: 2, anchor_cities: ['Porto'], total_km_by_mode: { IN_VEHICLE: 50, UNKNOWN: 20, FLYING: 2_000, IN_TAXI: 10 } }
    cleanup()
    render(<DataContext.Provider value={{ ...data, trips: [...data.trips, odd] }}><Trips /></DataContext.Provider>)
    fireEvent.click(screen.getByRole('button', { name: /^Open pass · Porto/ }))
    const labs = [...document.querySelectorAll('.bars .lab')].map((el) => el.textContent)
    expect(labs).toEqual(['Flight', 'Other'])
    expect(document.querySelectorAll('.bars .num')[1].textContent).toBe('80 km')
  })

  it('prints a live map only on the selected card and its neighbours; the rest wait on blank stock', () => {
    cleanup()
    const many = { ...base, trips: Array.from({ length: 20 }, (_, i) => ({ ...lisbon, start: start - i * 30 * D, end: start - i * 30 * D + 3 * D, anchor_cities: [`City ${i}`] })) }
    render(<DataContext.Provider value={many}><Trips /></DataContext.Provider>)
    expect(cards()).toHaveLength(20)
    expect(screen.getAllByTestId('tripmap')).toHaveLength(2)
    expect(within(cards()[0]).queryByTestId('tripmap')).toBeTruthy()
    expect(within(cards()[1]).queryByTestId('tripmap')).toBeTruthy()
    expect(within(cards()[2]).queryByTestId('tripmap')).toBeNull()
    fireEvent.keyDown(deck(), { key: 'ArrowRight' })
    expect(screen.getAllByTestId('tripmap').length).toBeLessThanOrEqual(3)
    expect(within(cards()[2]).queryByTestId('tripmap')).toBeTruthy()
    fireEvent.keyDown(deck(), { key: 'ArrowRight' })
    expect(within(cards()[0]).queryByTestId('tripmap')).toBeNull()
    expect(within(cards()[3]).queryByTestId('tripmap')).toBeTruthy()
  })

  it('MAP walks through the trip door', () => {
    wrap()
    fireEvent.click(within(cards()[0]).getByRole('button', { name: /^Open on the map: / }))
    const s = useStore.getState()
    expect(s.tab).toBe('map')
    expect(s.range).toEqual([lisbon.start, lisbon.end])
    expect(s.origin).toMatchObject({ backTab: 'trips', label: 'Lisbon → Sintra · 7 nights' })
  })
})
