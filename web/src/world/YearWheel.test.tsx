// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { YearWheel } from './YearWheel'
import { yearSpan, type Span } from '../app/yearWheel'
import { useStore } from '../store/useStore'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 1000
const record: Span = [utc(2019, 3, 4), utc(2025, 11, 15) + 86399]
const span = (y: number) => yearSpan(record, y)
const slider = () => screen.getByRole('slider', { name: 'Year' })
const row = () => slider().parentElement!
const drag = (el: Element, x0: number, ...xs: number[]) => {
  fireEvent.pointerDown(el, { clientX: x0, button: 0, pointerId: 1 })
  for (const x of xs) fireEvent.pointerMove(el, { clientX: x, pointerId: 1 })
  fireEvent.pointerUp(el, { clientX: xs[xs.length - 1] ?? x0, pointerId: 1 })
}

beforeEach(() => useStore.setState({ range: null }))
afterEach(cleanup)

describe('YearWheel', () => {
  it('prints the selected year big as the slider, with its neighbours ghosted either side', () => {
    useStore.setState({ range: span(2024) })
    render(<YearWheel range={record} />)
    expect(slider().textContent).toBe('2024')
    expect(screen.getByRole('button', { name: 'Year 2023' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Year 2025' })).toBeTruthy()
    expect(slider().getAttribute('aria-valuetext')).toBe('2024')
    expect(slider().getAttribute('aria-valuenow')).toBe('2024')
    expect(slider().getAttribute('aria-valuemin')).toBe('2019')
    expect(slider().getAttribute('aria-valuemax')).toBe('2025')
    // The slider holds no buttons; ghosts and ticks are its siblings.
    expect(slider().querySelector('button')).toBeNull()
    expect(screen.getByRole('button', { name: '2024' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('prints ALL for the whole record', () => {
    render(<YearWheel range={record} />)
    expect(slider().textContent).toBe('ALL')
    expect(slider().getAttribute('aria-valuetext')).toBe('All years')
    expect(screen.getByRole('button', { name: 'ALL' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Year 2025' })).toBeTruthy()
  })

  it('prints a custom window as its start year, tagged, with no tick pressed', () => {
    useStore.setState({ range: [record[1] - 90 * 86400, record[1]] })
    render(<YearWheel range={record} />)
    expect(slider().textContent).toBe('2025Custom')
    expect(slider().getAttribute('aria-valuetext')).toBe('Custom window')
    expect(slider().closest('.yearwheel')!.className).toContain('custom')
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0)
    // Enter on the slider leaves the custom window for the whole record.
    fireEvent.keyDown(slider(), { key: 'Enter' })
    expect(useStore.getState().range).toBeNull()
  })

  it('does not flap on first print, only the digits that change', () => {
    useStore.setState({ range: span(2024) })
    render(<YearWheel range={record} />)
    expect(slider().querySelectorAll('.flap')).toHaveLength(0)
    act(() => useStore.setState({ range: span(2025) }))
    const flapped = Array.from(slider().querySelectorAll('.flap')).map((e) => e.textContent)
    expect(flapped).toEqual(['5'])
  })

  it('arrow keys step a year, clamped to the record', () => {
    useStore.setState({ range: span(2024) })
    render(<YearWheel range={record} />)
    fireEvent.keyDown(slider(), { key: 'ArrowRight' })
    expect(useStore.getState().range).toEqual(span(2025))
    fireEvent.keyDown(slider(), { key: 'ArrowRight' })
    expect(useStore.getState().range).toEqual(span(2025))
    fireEvent.keyDown(slider(), { key: 'ArrowLeft' })
    expect(useStore.getState().range).toEqual(span(2024))
    fireEvent.keyDown(slider(), { key: 'Escape' })
    expect(useStore.getState().range).toBeNull()
    fireEvent.keyDown(slider(), { key: 'ArrowRight' })
    expect(useStore.getState().range).toEqual(span(2019))
  })

  it('a 250 px drag scrubs two years live and snaps on release', () => {
    useStore.setState({ range: span(2022) })
    render(<YearWheel range={record} />)
    const seen: (Span | null)[] = []
    const off = useStore.subscribe((s) => seen.push(s.range))
    fireEvent.pointerDown(row(), { clientX: 400, button: 0, pointerId: 1 })
    fireEvent.pointerMove(row(), { clientX: 300, pointerId: 1 })
    expect(useStore.getState().range).toEqual(span(2023))
    fireEvent.pointerMove(row(), { clientX: 150, pointerId: 1 })
    expect(useStore.getState().range).toEqual(span(2024))
    fireEvent.pointerUp(row(), { clientX: 150, pointerId: 1 })
    off()
    expect(useStore.getState().range).toEqual(span(2024))
    expect(seen).toEqual([span(2023), span(2024)])
    expect(slider().getAttribute('aria-valuetext')).toBe('2024')
  })

  it('follows the finger at the measured pitch with no jump at a crossing', () => {
    useStore.setState({ range: span(2022) })
    render(<YearWheel range={record} pitch={240} />)
    fireEvent.pointerDown(row(), { clientX: 400, button: 0, pointerId: 1 })
    fireEvent.pointerMove(row(), { clientX: 150, pointerId: 1 })
    expect(useStore.getState().range).toEqual(span(2023))
    const wrap = slider().closest('.yearwheel') as HTMLElement
    expect(parseFloat(wrap.style.getPropertyValue('--dx'))).toBeCloseTo(-10)
    fireEvent.pointerUp(row(), { clientX: 150, pointerId: 1 })
    expect(parseFloat(wrap.style.getPropertyValue('--dx'))).toBe(0)
  })

  it('a long drag clamps at the first year', () => {
    useStore.setState({ range: span(2022) })
    render(<YearWheel range={record} />)
    drag(row(), 0, 1000)
    expect(useStore.getState().range).toEqual(span(2019))
  })

  it('takes the pointer only once a drag is real, so taps still reach the buttons', () => {
    useStore.setState({ range: span(2024) })
    render(<YearWheel range={record} />)
    const capture = vi.fn()
    ;(row() as HTMLElement).setPointerCapture = capture
    const ghost = screen.getByRole('button', { name: 'Year 2025' })
    fireEvent.pointerDown(ghost, { clientX: 100, button: 0, pointerId: 1 })
    fireEvent.pointerUp(ghost, { clientX: 100, pointerId: 1 })
    fireEvent.click(ghost)
    expect(capture).not.toHaveBeenCalled()
    expect(useStore.getState().range).toEqual(span(2025))

    const big = slider()
    fireEvent.pointerDown(big, { clientX: 100, button: 0, pointerId: 1 })
    fireEvent.pointerMove(big, { clientX: 130, pointerId: 1 })
    fireEvent.pointerUp(big, { clientX: 130, pointerId: 1 })
    fireEvent.click(big)
    expect(capture).toHaveBeenCalledWith(1)
    expect(useStore.getState().range).toEqual(span(2025))
  })

  it('a trackpad flick steps once per 120 px, not once per event', () => {
    useStore.setState({ range: span(2022) })
    render(<YearWheel range={record} />)
    vi.useFakeTimers({ toFake: ['performance'] })
    try {
      for (let i = 0; i < 6; i++) fireEvent.wheel(row(), { deltaX: 25 })
      expect(useStore.getState().range).toEqual(span(2023))
      // The leftover 30 px dies after a 300 ms pause; a fresh flick starts from zero.
      vi.advanceTimersByTime(400)
      fireEvent.wheel(row(), { deltaX: -100 })
      expect(useStore.getState().range).toEqual(span(2023))
      fireEvent.wheel(row(), { deltaX: -20 })
      expect(useStore.getState().range).toEqual(span(2022))
    } finally { vi.useRealTimers() }
  })

  it('tapping the big year returns to all; tapping a ghost jumps to it', () => {
    useStore.setState({ range: span(2024) })
    render(<YearWheel range={record} />)
    fireEvent.click(slider())
    expect(useStore.getState().range).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Year 2025' }))
    expect(useStore.getState().range).toEqual(span(2025))
    fireEvent.click(screen.getByRole('button', { name: 'Year 2024' }))
    expect(useStore.getState().range).toEqual(span(2024))
    fireEvent.click(screen.getByRole('button', { name: '2020' }))
    expect(useStore.getState().range).toEqual(span(2020))
  })
})
