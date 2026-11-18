// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useRef } from 'react'
import { fineness, pinchStep, scrubDelta, usePinch, useScrub } from './useScrub'
import { useStore } from '../store/useStore'

describe('fineness', () => {
  it('is 1 inside the strip and divides by 4.5 per strip-height above, floored at 1/20', () => {
    expect(fineness(0, 56)).toBe(1)
    expect(fineness(30, 56)).toBe(1)
    expect(fineness(-56, 56)).toBeCloseTo(1 / 4.5)
    expect(fineness(-112, 56)).toBeCloseTo(1 / 20)
    expect(fineness(-500, 56)).toBeCloseTo(1 / 20)
  })
})
describe('scrubDelta', () => {
  it('moves time by dx × span/width × fineness, clamped to the range', () => {
    expect(scrubDelta({ from: 1000, dx: 10, y: 0, width: 100, height: 56, range: [0, 10_000] })).toBe(2000)
    expect(scrubDelta({ from: 1000, dx: 10, y: -112, width: 100, height: 56, range: [0, 10_000] })).toBe(1050)
    expect(scrubDelta({ from: 9_900, dx: 50, y: 0, width: 100, height: 56, range: [0, 10_000] })).toBe(10_000)
  })
})
describe('pinchStep', () => {
  it('steps coarser past 1.25×, finer under 0.8×, nothing in between', () => {
    expect(pinchStep(100, 130)).toBe(1)
    expect(pinchStep(100, 75)).toBe(-1)
    expect(pinchStep(100, 110)).toBe(0)
    expect(pinchStep(100, 85)).toBe(0)
  })
})

const RANGE: [number, number] = [0, 10_000]
function Strip({ onStep }: { onStep?: (dir: 1 | -1) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useScrub(ref, RANGE)
  usePinch(ref, onStep ?? (() => {}))
  return <div ref={ref} data-testid="strip" />
}
const strip = () => {
  const el = render(<Strip />).getByTestId('strip')
  el.getBoundingClientRect = () => ({ left: 0, top: 100, width: 100, height: 56, right: 100, bottom: 156, x: 0, y: 100, toJSON: () => ({}) })
  el.setPointerCapture = () => {}
  el.releasePointerCapture = () => {}
  return el
}

describe('useScrub', () => {
  beforeEach(() => { vi.useFakeTimers(); useStore.setState({ playhead: null, playing: true, scrubbing: false }) })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('a touch pauses, marks scrubbing and lands the playhead where the finger is', () => {
    const el = strip()
    fireEvent.pointerDown(el, { clientX: 25, clientY: 120, button: 0, pointerId: 1 })
    expect(useStore.getState()).toMatchObject({ playing: false, scrubbing: true, playhead: 2500 })
  })
  it('dragging moves by dx, finer when the finger rises above the strip', () => {
    const el = strip()
    fireEvent.pointerDown(el, { clientX: 25, clientY: 120, button: 0, pointerId: 1 })
    fireEvent.pointerMove(el, { clientX: 35, clientY: 120, pointerId: 1 })
    expect(useStore.getState().playhead).toBe(3500)
    fireEvent.pointerMove(el, { clientX: 45, clientY: 100 - 112, pointerId: 1 })
    expect(useStore.getState().playhead).toBe(3550)
  })
  it('lifting clears scrubbing after a moment, unless a new touch lands first', () => {
    const el = strip()
    fireEvent.pointerDown(el, { clientX: 25, clientY: 120, button: 0, pointerId: 1 })
    fireEvent.pointerUp(el, { pointerId: 1 })
    act(() => { vi.advanceTimersByTime(300) })
    expect(useStore.getState().scrubbing).toBe(true)
    fireEvent.pointerDown(el, { clientX: 25, clientY: 120, button: 0, pointerId: 1 })
    act(() => { vi.advanceTimersByTime(400) })
    expect(useStore.getState().scrubbing).toBe(true)
    fireEvent.pointerUp(el, { pointerId: 1 })
    act(() => { vi.advanceTimersByTime(600) })
    expect(useStore.getState().scrubbing).toBe(false)
  })
})

describe('usePinch', () => {
  afterEach(cleanup)
  it('steps once per gesture when two fingers spread or close enough', () => {
    const onStep = vi.fn()
    const el = render(<Strip onStep={onStep} />).getByTestId('strip')
    el.setPointerCapture = () => {}
    fireEvent.pointerDown(el, { clientX: 0, clientY: 0, pointerId: 1, pointerType: 'touch' })
    fireEvent.pointerDown(el, { clientX: 100, clientY: 0, pointerId: 2, pointerType: 'touch' })
    fireEvent.pointerMove(el, { clientX: 110, clientY: 0, pointerId: 2 })
    expect(onStep).not.toHaveBeenCalled()
    fireEvent.pointerMove(el, { clientX: 130, clientY: 0, pointerId: 2 })
    expect(onStep).toHaveBeenCalledWith(1)
    fireEvent.pointerMove(el, { clientX: 200, clientY: 0, pointerId: 2 })
    expect(onStep).toHaveBeenCalledTimes(1)
    fireEvent.pointerUp(el, { pointerId: 2 })
    fireEvent.pointerUp(el, { pointerId: 1 })
    fireEvent.pointerDown(el, { clientX: 0, clientY: 0, pointerId: 1, pointerType: 'touch' })
    fireEvent.pointerDown(el, { clientX: 100, clientY: 0, pointerId: 2, pointerType: 'touch' })
    fireEvent.pointerMove(el, { clientX: 70, clientY: 0, pointerId: 2 })
    expect(onStep).toHaveBeenLastCalledWith(-1)
  })
})
