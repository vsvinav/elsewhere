// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { OriginTag } from './OriginTag'
import { useStore } from '../store/useStore'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function mount() {
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  act(() => root.render(createElement(OriginTag)))
  return { host, unmount: () => { act(() => root.unmount()); host.remove() } }
}

beforeEach(() => { location.hash = 'home'; useStore.setState({ tab: 'home', origin: null, focus: null, range: null, pin: null }) })

describe('OriginTag', () => {
  it('prints nothing until a door has been opened', () => {
    const { host, unmount } = mount()
    expect(host.innerHTML).toBe('')
    unmount()
  })

  it('names where the reader came from and takes them back on tap', () => {
    useStore.setState({ tab: 'stats' })
    act(() => useStore.getState().goTo({ kind: 'range', from: 1, to: 2, label: '42 countries' }))
    const { host, unmount } = mount()
    const b = host.querySelector('button')!
    expect(b.textContent).toMatch(/FROM · 42 COUNTRIES/i)
    expect(b.getAttribute('aria-label')).toBe('Back to Numbers')
    act(() => b.click())
    expect(useStore.getState().tab).toBe('stats')
    expect(useStore.getState().origin).toBeNull()
    unmount()
  })

  it('goes away when the reader changes the range or pin themselves', () => {
    act(() => useStore.getState().goTo({ kind: 'range', from: 1, to: 2, label: 'x' }))
    const { host, unmount } = mount()
    expect(host.querySelector('button')).not.toBeNull()
    act(() => useStore.getState().setPin('somewhere'))
    expect(host.querySelector('button')).toBeNull()
    unmount()
  })
})
