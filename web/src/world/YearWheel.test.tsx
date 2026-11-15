// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { YearWheel } from './YearWheel'
import { yearSpan, type Span } from '../app/yearWheel'
import { useStore } from '../store/useStore'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 1000
const record: Span = [utc(2019, 3, 4), utc(2025, 11, 15) + 86399]
const span = (y: number) => yearSpan(record, y)
const slider = () => screen.getByRole('slider', { name: 'Year' })

beforeEach(() => useStore.setState({ range: null }))
afterEach(cleanup)

describe('YearWheel', () => {
  it('prints the selected year big, with its neighbours ghosted either side', () => {
    useStore.setState({ range: span(2024) })
    render(<YearWheel range={record} />)
    expect(screen.getByRole('button', { name: 'Year 2024, back to all years' }).textContent).toBe('2024')
    expect(screen.getByRole('button', { name: 'Year 2023' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Year 2025' })).toBeTruthy()
    expect(slider().getAttribute('aria-valuetext')).toBe('2024')
    expect(slider().getAttribute('aria-valuenow')).toBe('2024')
    expect(slider().getAttribute('aria-valuemin')).toBe('2019')
    expect(slider().getAttribute('aria-valuemax')).toBe('2025')
  })

  it('prints ALL for the whole record', () => {
    render(<YearWheel range={record} />)
    expect(screen.getByRole('button', { name: 'All years' }).textContent).toBe('ALL')
    expect(slider().getAttribute('aria-valuetext')).toBe('All years')
    expect(screen.queryByRole('button', { name: 'Year 2025' })).toBeTruthy()
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
    fireEvent.pointerDown(slider(), { clientX: 400, button: 0, pointerId: 1 })
    fireEvent.pointerMove(slider(), { clientX: 300, pointerId: 1 })
    expect(useStore.getState().range).toEqual(span(2023))
    fireEvent.pointerMove(slider(), { clientX: 150, pointerId: 1 })
    expect(useStore.getState().range).toEqual(span(2024))
    fireEvent.pointerUp(slider(), { clientX: 150, pointerId: 1 })
    off()
    expect(useStore.getState().range).toEqual(span(2024))
    expect(seen).toEqual([span(2023), span(2024)])
    expect(slider().getAttribute('aria-valuetext')).toBe('2024')
  })

  it('a long drag clamps at the first year', () => {
    useStore.setState({ range: span(2022) })
    render(<YearWheel range={record} />)
    fireEvent.pointerDown(slider(), { clientX: 0, button: 0, pointerId: 1 })
    fireEvent.pointerMove(slider(), { clientX: 1000, pointerId: 1 })
    fireEvent.pointerUp(slider(), { clientX: 1000, pointerId: 1 })
    expect(useStore.getState().range).toEqual(span(2019))
  })

  it('a horizontal wheel steps one year', () => {
    useStore.setState({ range: span(2022) })
    render(<YearWheel range={record} />)
    fireEvent.wheel(slider(), { deltaX: 40 })
    expect(useStore.getState().range).toEqual(span(2023))
    // Trackpads fire many events per flick; only one step lands per flap.
    fireEvent.wheel(slider(), { deltaX: 40 })
    expect(useStore.getState().range).toEqual(span(2023))
  })

  it('tapping the big year returns to all; tapping a ghost jumps to it', () => {
    useStore.setState({ range: span(2024) })
    render(<YearWheel range={record} />)
    fireEvent.click(screen.getByRole('button', { name: 'Year 2024, back to all years' }))
    expect(useStore.getState().range).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Year 2025' }))
    expect(useStore.getState().range).toEqual(span(2025))
    fireEvent.click(screen.getByRole('button', { name: 'Year 2024' }))
    expect(useStore.getState().range).toEqual(span(2024))
    fireEvent.click(screen.getByRole('button', { name: '2020' }))
    expect(useStore.getState().range).toEqual(span(2020))
  })
})
