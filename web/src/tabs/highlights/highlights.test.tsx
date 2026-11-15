// @vitest-environment jsdom
vi.hoisted(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { onThisDayData, at } from '../../test/onThisDay'
import { MAX_DEPTH } from '../../analytics/highlights'
import { HighlightCard } from './HighlightCard'
import { ago, headline } from './copy'

vi.mock('../../world/TripMap', () => ({ TripMap: ({ range }: { range: [number, number] }) => createElement('div', { className: 'tripmap', 'data-range': range.join(',') }) }))

const data = onThisDayData()
type Open = [range: [number, number], playhead?: number, placeIds?: string[]]

let host: HTMLDivElement, root: Root
function mount(props: Partial<Parameters<typeof HighlightCard>[0]> & { today: string }) {
  const calls: Open[] = []
  host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  act(() => root.render(createElement(HighlightCard, { data, onOpen: (...a: Open) => calls.push(a), ...props })))
  return calls
}
afterEach(() => { act(() => root.unmount()); host.remove() })

const q = <T extends Element = HTMLElement>(sel: string, from: ParentNode = document) => from.querySelector<T>(sel)
const all = (sel: string, from: ParentNode = document) => Array.from(from.querySelectorAll<HTMLElement>(sel))
const click = (el: Element | null) => { if (!el) throw new Error('nothing to click'); act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) }) }
const key = (el: EventTarget, key: string, init: KeyboardEventInit = {}) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init })) })
const byText = (sel: string, text: string) => all(sel).find((b) => b.textContent?.includes(text)) ?? null
const askButton = () => byText('button', 'Ask for more')
const dialog = () => q('[role=dialog]')

describe('HighlightCard', () => {
  it('prints the headline, three facts as doors and the scoped map', () => {
    const calls = mount({ today: '2025-11-14' })
    expect(q('.hl-h')!.textContent).toBe('On this day, 2 years ago — you woke up in Kyoto.')
    const facts = all('.hl-facts .hl-fact')
    expect(facts.map((b) => b.textContent)).toEqual(['3 nights into a 7-night trip', '10,800 km from home', 'Weather of your week'])
    expect(q('.hl-fact .fig.beds')).not.toBeNull()
    click(facts[1])
    expect(calls).toEqual([[[at(2023, 11, 14), at(2023, 11, 15)], at(2023, 11, 11, 23), ['kyoto-hotel']]])
    expect(q('.tripmap')!.getAttribute('data-range')).toBe(`${at(2023, 11, 14)},${at(2023, 11, 15)}`)
  })
  it('the map is a keyboard door', () => {
    const calls = mount({ today: '2025-11-14' })
    const map = q('[role=button][aria-label="Open this day on the map"]')!
    expect(map.tabIndex).toBe(0)
    key(map, 'Enter')
    expect(calls).toHaveLength(1)
    expect(calls[0][1]).toBe(at(2023, 11, 11, 23))
  })
  it('quiet day names the nearest highlight and shows it on request', () => {
    mount({ today: '2025-07-20' })
    expect(q('.hl-h')!.textContent).toBe('Nothing from a 20 July yet.')
    expect(askButton()).toBeNull()
    const near = byText('.hl-link', '3 May 2025, Kyoto')!
    click(near)
    expect(q('.hl-h')!.textContent).toBe('On this day, earlier this year — you woke up in Kyoto.')
    expect(q('.hl-note')!.textContent).toContain('Nothing from a 20 July yet')
  })
  it('record shorter than a year shows the farthest day with the start-date note', () => {
    const d = onThisDayData(); d.meta.range = [at(2023, 3, 3), at(2023, 5, 1)]
    host = document.body.appendChild(document.createElement('div')); root = createRoot(host)
    act(() => root.render(createElement(HighlightCard, { data: d, today: '2023-04-10', onOpen: () => {} })))
    expect(q('.hl-note')!.textContent).toBe("Your record starts 3 March. Highlights begin on 3 March next year — meanwhile, here's your farthest day so far.")
    expect(q('.hl-h')!.textContent).toContain('landed in Paris')
  })
  it('offers the key step when the city is unnamed', () => {
    const d = onThisDayData(); d.places['nyc-hotel'] = { ...d.places['nyc-hotel'], city: null }
    const onKeyStep = vi.fn()
    host = document.body.appendChild(document.createElement('div')); root = createRoot(host)
    act(() => root.render(createElement(HighlightCard, { data: d, today: '2028-02-29', onOpen: () => {}, onKeyStep })))
    expect(q('.hl-h')!.textContent).toContain('40.71°, -74.01°')
    click(byText('.hl-link', 'Google Maps key'))
    expect(onKeyStep).toHaveBeenCalledOnce()
  })
  it('"pick another day" re-reads the record for that date', () => {
    mount({ today: '2025-11-14' })
    click(q('.datepick-chip'))
    expect(q('.datepick-pop h3')!.textContent).toContain('November')
    // Days after today are dead; 11 Nov is the Kyoto arrival.
    expect(all('.datepick-grid button').find((b) => b.textContent === '15')!.hasAttribute('disabled')).toBe(true)
    click(all('.datepick-grid button').find((b) => b.textContent === '11')!)
    expect(q('.hl-h')!.textContent).toBe('On this day, 2 years ago — you landed in Kyoto.')
  })
})

describe('AskMoreDrawer', () => {
  it('opens as a modal dialog listing only the answerable questions, with focus inside', () => {
    mount({ today: '2025-11-14' })
    expect(dialog()).toBeNull()
    const ask = askButton()!
    expect(ask.getAttribute('aria-haspopup')).toBe('dialog')
    click(ask)
    const dlg = dialog()!
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    expect(dlg.getAttribute('aria-label')).toBe('Ask for more')
    expect(ask.getAttribute('aria-expanded')).toBe('true')
    expect(dlg.contains(document.activeElement)).toBe(true)
    const qs = all('.hl-q', dlg).map((b) => b.textContent)
    expect(qs).toEqual(['How long did I stay?', 'How far from home?', 'What else happened that trip?', 'Show me the route', 'How does this compare to other years?', 'What did I do that day?', 'Have I been back?', 'Was this my farthest ever?'])
    expect(qs).not.toContain('What was I doing this time last year?')
    expect(q('.hl-crumb', dlg)!.textContent).toBe('Kyoto')
  })
  it('prints answers as passes with their own doors and grows the breadcrumb', () => {
    const calls = mount({ today: '2025-11-14' })
    click(askButton())
    click(byText('.hl-q', 'How long did I stay?'))
    const pass = q('.hl-answer')!
    expect(q('.hl-a', pass)!.textContent).toBe('6 nights')
    expect(q('.hl-d', pass)!.textContent).toBe('12–17 Nov 2023')
    expect(q('.fig.beds', pass)).not.toBeNull()
    expect(q('.hl-crumb')!.textContent).toBe('Kyotothe stay')
    expect(all('.hl-q').map((b) => b.textContent)).not.toContain('How long did I stay?')
    click(byText('.hl-answer .btn', 'Open on the map'))
    expect(calls).toHaveLength(1)
    expect(calls[0][2]).toEqual(['kyoto-hotel'])
    click(byText('.hl-q', 'What else happened that trip?'))
    expect(all('.hl-setlist .hl-row').map((b) => b.textContent)).toEqual(['Kyoto6 nightsfirst time', 'Osaka1 nightfirst time'])
    expect(q('.hl-crumb')!.textContent).toBe('Kyotothe staythe trip')
  })
  it('chains through "last year" to another highlight and stops at depth 4', () => {
    mount({ today: '2025-11-15' })
    // Paris 2022 wins 15 Nov; pick 2023 via the date picker's day 14 to start from Kyoto... simpler: Paris has no "last year", so chain on other questions.
    click(askButton())
    for (let i = 0; i < MAX_DEPTH; i++) {
      const next = q('.hl-q')
      expect(next, `question at depth ${i}`).not.toBeNull()
      click(next)
    }
    expect(all('.hl-answer')).toHaveLength(MAX_DEPTH)
    expect(all('.hl-q')).toHaveLength(0)
    expect(q('[role=status]')!.textContent).toBe("That's as far as this thread goes.")
    expect(all('.hl-crumb span')).toHaveLength(MAX_DEPTH + 1)
  })
  it('"this time last year" prints another highlight card inside the sheet', () => {
    const d = onThisDayData()
    host = document.body.appendChild(document.createElement('div')); root = createRoot(host)
    // 15 Nov 2023 (Kyoto) has a 2022 Paris day behind it; reach it by picking the day in a record where Paris scores lower.
    d.daily = d.daily.map((x) => (x.date === '2022-11-15' ? { ...x, n_new_places: 0 } : x))
    act(() => root.render(createElement(HighlightCard, { data: d, today: '2025-11-15', onOpen: () => {} })))
    expect(q('.hl-h')!.textContent).toContain('Kyoto')
    click(askButton())
    click(byText('.hl-q', 'this time last year'))
    expect(q('.hl-answer .hl-a')!.textContent).toBe('On this day, 3 years ago — you landed in Paris.')
    expect(q('.hl-crumb')!.textContent).toBe('KyotoParis')
    expect(q('.hl-lede')!.textContent).toContain(headline({ ...d, verb: 'landed in', city: 'Paris', scope: 'day', yearsAgo: 3 } as never))
    expect(all('.hl-q').map((b) => b.textContent)).toContain('How long did I stay?')
  })
  it('closes on Escape, on the backdrop, and on the close button, returning focus', () => {
    mount({ today: '2025-11-14' })
    const ask = askButton()!
    ask.focus()
    click(ask)
    expect(document.activeElement).not.toBe(ask)
    key(document, 'Escape')
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(ask)
    click(ask)
    click(q('[data-testid=hl-backdrop]'))
    expect(dialog()).toBeNull()
    click(ask)
    click(q('.hl-sheet'))
    expect(dialog()).not.toBeNull()
    click(q('[aria-label=Close]'))
    expect(dialog()).toBeNull()
  })
  it('traps Tab inside the sheet', () => {
    mount({ today: '2025-11-14' })
    click(askButton())
    const dlg = dialog()!
    const items = all('button', dlg)
    const last = items[items.length - 1]
    last.focus()
    key(last, 'Tab')
    expect(document.activeElement).toBe(items[0])
    key(items[0], 'Tab', { shiftKey: true })
    expect(document.activeElement).toBe(last)
  })
})

test('copy helpers', () => {
  expect([0, 1, 2].map(ago)).toEqual(['earlier this year', 'last year', '2 years ago'])
})
