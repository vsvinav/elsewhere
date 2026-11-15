// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { OriginTag } from './OriginTag'
import { useStore } from '../store/useStore'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => { location.hash = 'home'; useStore.setState({ tab: 'home', origin: null, focus: null, range: null, pin: null }) })
afterEach(cleanup)

describe('OriginTag', () => {
  it('prints nothing until a door has been opened', () => {
    const { container } = render(<OriginTag />)
    expect(container.innerHTML).toBe('')
  })

  it('names where the reader came from and takes them back on tap', () => {
    useStore.setState({ tab: 'stats' })
    act(() => useStore.getState().goTo({ kind: 'range', from: 1, to: 2, label: '42 countries' }))
    render(<OriginTag />)
    const b = screen.getByRole('button', { name: 'Back to Numbers' })
    expect(b.textContent).toMatch(/From · 42 countries/)
    fireEvent.click(b)
    expect(useStore.getState().tab).toBe('stats')
    expect(useStore.getState().origin).toBeNull()
  })

  it('is reachable from the keyboard', () => {
    act(() => useStore.getState().goTo({ kind: 'range', from: 1, to: 2, label: 'x' }))
    render(<OriginTag />)
    const b = screen.getByRole('button')
    b.focus()
    expect(document.activeElement).toBe(b)
    expect(b.tagName).toBe('BUTTON')
  })

  it('goes away when the reader changes the range or pin themselves', () => {
    act(() => useStore.getState().goTo({ kind: 'range', from: 1, to: 2, label: 'x' }))
    render(<OriginTag />)
    expect(screen.queryByRole('button')).not.toBeNull()
    act(() => useStore.getState().setPin('somewhere'))
    expect(screen.queryByRole('button')).toBeNull()
  })
})
