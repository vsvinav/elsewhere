// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Profiler } from 'react'
import { DataContext } from '../data/DataContext'
import { sampleData } from '../test/sample'
import { useStore } from '../store/useStore'
import { atPlayhead, cumulative } from '../analytics/timeline'
import { Hud } from './Hud'

const data = sampleData()
const [m0, m1] = data.meta.range
const mount = () => render(<DataContext.Provider value={data}><Hud /></DataContext.Provider>)
const strip = () => {
  const el = screen.getByTestId('scrub')
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 56, right: 1000, bottom: 56, x: 0, y: 0, toJSON() {} }) as DOMRect
  el.setPointerCapture = () => {}
  el.releasePointerCapture = () => {}
  el.hasPointerCapture = () => false
  return el
}

beforeEach(() => { useStore.setState({ playhead: m0, playing: true, scrubbing: false, grain: null, follow: true }); vi.useFakeTimers() })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('the strip', () => {
  it('still has the keyboard range input', () => {
    mount()
    const input = screen.getByLabelText('Timeline position') as HTMLInputElement
    expect(input.type).toBe('range')
    fireEvent.change(input, { target: { value: String(m0 + 86400) } })
    expect(useStore.getState().playhead).toBe(m0 + 86400)
  })
  it('pauses and scrubs on pointer down, and lets go a moment after release', () => {
    mount()
    const el = strip()
    fireEvent.pointerDown(el, { clientX: 500, clientY: 20, pointerId: 1, button: 0, pointerType: 'touch' })
    expect(useStore.getState().playing).toBe(false)
    expect(useStore.getState().scrubbing).toBe(true)
    expect(useStore.getState().playhead).toBeCloseTo(m0 + (m1 - m0) / 2, -2)
    fireEvent.pointerMove(el, { clientX: 600, clientY: 20, pointerId: 1 })
    expect(useStore.getState().playhead).toBeCloseTo(m0 + (m1 - m0) * 0.6, -2)
    fireEvent.pointerUp(el, { pointerId: 1 })
    expect(useStore.getState().scrubbing).toBe(true)
    act(() => { vi.advanceTimersByTime(650) })
    expect(useStore.getState().scrubbing).toBe(false)
  })
})

describe('grain chips', () => {
  it('offers Year, Month and Day on a three-month record with trips, starting at Day', () => {
    mount()
    const group = screen.getByRole('radiogroup', { name: 'Time grain' })
    expect(group.querySelectorAll('[role=radio]')).toHaveLength(3)
    expect((screen.getByRole('radio', { name: 'Day' }) as HTMLButtonElement).getAttribute('aria-checked')).toBe('true')
    expect((screen.getByRole('radio', { name: 'Year' }) as HTMLButtonElement).disabled).toBe(false)
  })
  it('disables Year when the record has no trips', () => {
    render(<DataContext.Provider value={{ ...data, trips: [] }}><Hud /></DataContext.Provider>)
    expect((screen.getByRole('radio', { name: 'Year' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('radio', { name: 'Month' }) as HTMLButtonElement).disabled).toBe(false)
  })
  it('disables Year and Month on a short record', () => {
    render(<DataContext.Provider value={{ ...data, meta: { ...data.meta, range: [m0, m0 + 10 * 86400] } }}><Hud /></DataContext.Provider>)
    expect((screen.getByRole('radio', { name: 'Year' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('radio', { name: 'Month' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('radio', { name: 'Day' }).getAttribute('aria-checked')).toBe('true')
  })
  it('clicking a chip sets the grain; ctrl+wheel up goes finer, down coarser, like a trackpad pinch', () => {
    mount()
    fireEvent.click(screen.getByRole('radio', { name: 'Year' }))
    expect(useStore.getState().grain).toBe('year')
    fireEvent.wheel(strip(), { deltaY: -60, ctrlKey: true })
    expect(useStore.getState().grain).toBe('month')
    fireEvent.wheel(strip(), { deltaY: -60, ctrlKey: true })
    expect(useStore.getState().grain).toBe('day')
    fireEvent.wheel(strip(), { deltaY: -60, ctrlKey: true })
    expect(useStore.getState().grain).toBe('day')
    fireEvent.wheel(strip(), { deltaY: 60, ctrlKey: true })
    expect(useStore.getState().grain).toBe('month')
    fireEvent.wheel(strip(), { deltaY: 60 })
    expect(useStore.getState().grain).toBe('month')
  })
})

describe('headline', () => {
  it('prints the playhead at the grain', () => {
    useStore.setState({ grain: 'year' })
    mount()
    expect(screen.getByText('2024')).toBeTruthy()
    act(() => useStore.setState({ grain: 'month', playhead: Date.UTC(2024, 2, 10) / 1000 }))
    act(() => { vi.advanceTimersByTime(200) })
    expect(screen.getByText('March 2024')).toBeTruthy()
    act(() => useStore.setState({ grain: 'day' }))
    expect(screen.getByText('MAR 2024')).toBeTruthy()
    expect(screen.getByText('10')).toBeTruthy()
  })
})

describe('while playing', () => {
  it('does not re-render for every playhead tick; the rail reads the raw playhead only while scrubbing', () => {
    let renders = 0
    render(<DataContext.Provider value={data}><Profiler id="hud" onRender={() => { renders++ }}><Hud /></Profiler></DataContext.Provider>)
    const before = renders
    expect(before).toBeGreaterThan(0)
    const sub = vi.fn()
    const off = useStore.subscribe(sub)
    for (let i = 1; i <= 30; i++) act(() => useStore.setState({ playhead: m0 + i * 60 }))
    off()
    expect(sub).toHaveBeenCalledTimes(30)
    // The HUD only follows the 100 ms throttle (fake timers never fire it here), so the store ticks reach no render.
    expect(screen.getByLabelText('Timeline position').getAttribute('value')).toBe(String(m0))
    expect(renders).toBe(before)
    act(() => useStore.setState({ scrubbing: true }))
    const after = renders
    act(() => useStore.setState({ playhead: data.trips[1].end + 3600 }))
    expect(renders).toBeGreaterThan(after)
  })
})

describe('rail', () => {
  it('prints only while scrubbing, with the figures at the playhead', () => {
    mount()
    expect(screen.queryByRole('complementary', { name: 'So far' })).toBeNull()
    const t = data.trips[1].end + 3600
    act(() => useStore.setState({ scrubbing: true, playhead: t }))
    const rail = screen.getByRole('complementary', { name: 'So far' })
    const want = atPlayhead(cumulative(data), t)
    expect(want.flights).toBeGreaterThan(0)
    expect(rail.querySelectorAll('.rail-v')[3].textContent).toBe(String(want.flights))
    expect(rail.querySelectorAll('.rail-v')[0].textContent).toBe(Math.round(want.km).toLocaleString('en-US'))
    act(() => useStore.setState({ playhead: m0 }))
    expect(rail.querySelectorAll('.rail-v')[3].textContent).toBe('0')
  })
})
