// @vitest-environment jsdom
vi.hoisted(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof matchMedia
  class IO { observe() {} disconnect() {} unobserve() {} }
  window.IntersectionObserver = IO as unknown as typeof IntersectionObserver
})
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { sampleData } from '../test/sample'
import { DataContext } from '../data/DataContext'
import { RecordContext, type Record_ } from '../app/App'
import { useStore } from '../store/useStore'
import { tour } from '../analytics/tour'
import { Home } from './Home/Home'
import { Stats } from './Stats/Stats'
import { Facts } from './Facts/Facts'

vi.mock('../world/FlightMap', () => ({ FlightMap: () => createElement('div') }))
vi.mock('../world/PlaceMap', () => ({ PlaceMap: () => createElement('div') }))
vi.mock('../world/TripMap', () => ({ TripMap: () => createElement('div') }))
vi.mock('../world/TrailMap', () => ({ TrailMap: () => createElement('div') }))
vi.mock('../world/PlacePhoto', () => ({ PlacePhoto: () => createElement('div') }))

const data = sampleData()
const rec: Record_ = { mine: false, stage: null, importError: null, enrichError: null, importFile() {}, reset() {}, editProfile() {} }
const wrap = (ui: ReactNode) => render(<RecordContext.Provider value={rec}><DataContext.Provider value={data}>{ui}</DataContext.Provider></RecordContext.Provider>)
const doors = () => screen.getAllByRole('button', { name: /^Open on the map: / })

beforeEach(() => { location.hash = 'home'; useStore.setState({ tab: 'home', origin: null, focus: null, range: null, pin: null }) })
afterEach(cleanup)

describe('Tour', () => {
  it('a city on the dates list opens the map inside the nights spent there', () => {
    wrap(<Home />)
    const paris = tour(data).stops.find((s) => s.city === 'Paris')!
    const row = screen.getAllByRole('button', { name: `Open on the map: Paris · ${paris.nights} nights` })[0]
    expect(row.tagName).toBe('BUTTON')
    fireEvent.click(row)
    const s = useStore.getState()
    expect(s.tab).toBe('map')
    expect(s.range).toEqual([paris.first, paris.last])
    expect(s.playhead).toBeGreaterThanOrEqual(paris.first)
    expect(s.playhead).toBeLessThanOrEqual(paris.last)
    expect(s.origin).toMatchObject({ label: `Paris · ${paris.nights} nights`, backTab: 'home' })
  })

  it('the hero counts open as pins: one per country', () => {
    wrap(<Home />)
    // The lede and the foot both print it; both are doors.
    const both = screen.getAllByRole('button', { name: /^Open on the map: 2 countries$/ })
    expect(both).toHaveLength(2)
    fireEvent.click(both[0])
    const s = useStore.getState()
    expect(s.tab).toBe('map')
    expect(s.focus?.ids).toHaveLength(2)
  })

  it('a third place opens its own pin', () => {
    wrap(<Home />)
    const list = screen.getByRole('list', { name: 'Most visited third places' })
    const first = within(list).getAllByRole('button')[0]
    fireEvent.click(first)
    const pin = useStore.getState().pin!
    expect(pin).not.toBeNull()
    expect(data.places[pin]).toBeDefined()
    expect(useStore.getState().focus?.ids).toEqual([pin])
  })

  it('keeps the list, rows and cells semantic: the door sits inside them', () => {
    wrap(<Home />)
    const list = screen.getByRole('list', { name: 'Where you slept' })
    const items = within(list).getAllByRole('listitem')
    expect(items.length).toBeGreaterThan(0)
    for (const li of items) expect(li.getAttribute('role')).toBeNull()
    expect(within(items[0]).getByRole('button').getAttribute('aria-label')).toMatch(/^Open on the map: /)
    for (const el of document.querySelectorAll('li[role], tr[role], td[role], button h2, button li')) throw new Error(`bad nesting: ${el.outerHTML.slice(0, 80)}`)
    for (const row of screen.getAllByRole('row')) expect(row.getAttribute('role')).toBeNull()
  })

  it('every readable figure is a door, and every door has a label', () => {
    wrap(<Home />)
    const all = doors()
    expect(all.length).toBeGreaterThan(20)
    for (const d of all) expect(d.getAttribute('aria-label')).toMatch(/^Open on the map: .+/)
  })
})

describe('Numbers', () => {
  it('a city row opens its pins; its first and last dates open the window', () => {
    wrap(<Stats />)
    fireEvent.click(screen.getByRole('button', { name: /^Open on the map: Paris · \d+ visits$/ }))
    expect(useStore.getState().tab).toBe('map')
    expect(useStore.getState().focus?.ids?.length).toBeGreaterThan(0)
    expect(useStore.getState().focus!.ids!.every((id) => data.places[id].city === 'Paris')).toBe(true)

    screen.getByRole('button', { name: /^Open on the map: Paris · first visit [A-Z]{3} \d+, \d{4}$/ })
    fireEvent.click(screen.getByRole('button', { name: /^Open on the map: Paris · last visit [A-Z]{3} \d+, \d{4}$/ }))
    const r = useStore.getState().range!
    expect(data.visits.some((v) => data.places[v.place_id]?.city === 'Paris' && v.start >= r[0] && v.end <= r[1])).toBe(true)
  })

  it('the distance legend names modes in plain words, not raw constants', () => {
    wrap(<Stats />)
    const legend = document.querySelector('.legend')!
    const labs = [...legend.querySelectorAll('span')].map((el) => el.textContent)
    expect(labs).toEqual(['Flight', 'Car', 'Walk', 'Other'])
    expect(document.body.textContent).not.toMatch(/FLYING|IN_PASSENGER_VEHICLE|WALKING/)
  })

  it('unmapped modes never take a colour and fold into the one grey Other', () => {
    const t0 = data.meta.range[0]
    const day = (i: number, km_by_mode: Record<string, number>) => ({ ...data.daily[0], date: new Date((t0 + i * 86400) * 1000).toISOString().slice(0, 10), km_by_mode })
    const odd = { ...data, daily: [day(0, { IN_VEHICLE: 9_000, UNKNOWN: 8_000 }), day(1, { IN_TAXI: 7_000, FLYING: 100 })], activities: data.activities.filter((a) => a.mode === 'FLYING') }
    cleanup()
    render(<RecordContext.Provider value={rec}><DataContext.Provider value={odd}><Stats /></DataContext.Provider></RecordContext.Provider>)
    const labs = [...document.querySelector('.legend')!.querySelectorAll('span')].map((el) => el.textContent)
    expect(labs).toEqual(['Flight', 'Other'])
    expect(document.querySelector('.legend .ghost')!.textContent).toBe('Other')
  })

  it('the best month opens that month', () => {
    wrap(<Stats />)
    fireEvent.click(screen.getAllByRole('button', { name: /^Open on the map: Best month · / })[0])
    const r = useStore.getState().range!
    expect(new Date(r[0] * 1000).getUTCDate()).toBe(1)
    expect(r[1] - r[0]).toBeGreaterThan(27 * 86400)
    expect(r[1] - r[0]).toBeLessThan(32 * 86400)
  })
})

describe('Facts', () => {
  it('every fact headline is a door to what made it', () => {
    wrap(<Facts />)
    const heads = document.querySelectorAll('.facts .fact-h')
    expect(heads.length).toBeGreaterThan(3)
    for (const h of heads) expect(h.closest('button')).toBeNull()
    for (const h of heads) expect(h.querySelector('button')?.getAttribute('aria-label')).toMatch(/^Open on the map: /)
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThanOrEqual(heads.length)
    fireEvent.click(heads[0].querySelector('button')!)
    expect(useStore.getState().tab).toBe('map')
    expect(useStore.getState().origin?.backTab).toBe('home')
  })
})
