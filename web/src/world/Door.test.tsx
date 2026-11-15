// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Door, doorProps } from './Door'
import { useStore } from '../store/useStore'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const target = { kind: 'range' as const, from: 10, to: 20, label: '42 countries' }

beforeEach(() => { location.hash = 'home'; useStore.setState({ tab: 'home', origin: null, focus: null, range: null }) })
afterEach(cleanup)

describe('Door', () => {
  it('is a real button that says where it leads, and keeps the figure as its face', () => {
    render(<Door target={target}>42</Door>)
    const b = screen.getByRole('button', { name: 'Open on the map: 42 countries' })
    expect(b.tagName).toBe('BUTTON')
    expect(b.getAttribute('type')).toBe('button')
    expect(b.textContent).toBe('42')
    expect(b.className).toContain('door')
  })

  it('a click walks through it', () => {
    render(<Door target={target}>42</Door>)
    fireEvent.click(screen.getByRole('button'))
    expect(useStore.getState().tab).toBe('map')
    expect(useStore.getState().range).toEqual([10, 20])
    expect(useStore.getState().origin?.label).toBe('42 countries')
  })

  it('Enter and Space open it from the keyboard', () => {
    render(<Door target={target}>42</Door>)
    const b = screen.getByRole('button')
    b.focus()
    expect(document.activeElement).toBe(b)
    // A native button fires click on Enter; jsdom does not synthesise that, so the click is the contract.
    fireEvent.click(b)
    expect(useStore.getState().tab).toBe('map')
  })

  it('doorProps makes any element a keyboard-reachable door', () => {
    render(<li {...doorProps(target)}>Lisbon · 14 nights</li>)
    const li = screen.getByRole('button', { name: 'Open on the map: 42 countries' })
    expect(li.tagName).toBe('LI')
    expect(li.getAttribute('tabindex')).toBe('0')
    fireEvent.keyDown(li, { key: 'Enter' })
    expect(useStore.getState().tab).toBe('map')

    useStore.setState({ tab: 'home' })
    fireEvent.keyDown(li, { key: 'a' })
    expect(useStore.getState().tab).toBe('home')
    fireEvent.keyDown(li, { key: ' ' })
    expect(useStore.getState().tab).toBe('map')

    useStore.setState({ tab: 'home' })
    fireEvent.click(li)
    expect(useStore.getState().tab).toBe('map')
  })
})
