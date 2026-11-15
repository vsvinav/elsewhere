// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Door, doorProps } from './Door'
import { useStore } from '../store/useStore'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const target = { kind: 'range' as const, from: 10, to: 20, label: '42 countries' }

function mount(el: React.ReactElement) {
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  act(() => root.render(el))
  return { host, unmount: () => { act(() => root.unmount()); host.remove() } }
}

beforeEach(() => { location.hash = 'home'; useStore.setState({ tab: 'home', origin: null, focus: null, range: null }) })

describe('Door', () => {
  it('is a real button that says where it leads, and keeps the figure as its face', () => {
    const { host, unmount } = mount(createElement(Door, { target, children: '42' }))
    const b = host.querySelector('button')!
    expect(b).not.toBeNull()
    expect(b.getAttribute('type')).toBe('button')
    expect(b.getAttribute('aria-label')).toBe('Open on the map: 42 countries')
    expect(b.textContent).toBe('42')
    expect(b.className).toContain('door')
    unmount()
  })

  it('a click walks through it', () => {
    const { host, unmount } = mount(createElement(Door, { target, children: '42' }))
    act(() => host.querySelector('button')!.click())
    expect(useStore.getState().tab).toBe('map')
    expect(useStore.getState().range).toEqual([10, 20])
    expect(useStore.getState().origin?.label).toBe('42 countries')
    unmount()
  })

  it('doorProps makes any element a keyboard-reachable door', () => {
    const { host, unmount } = mount(createElement('li', doorProps(target), 'Lisbon · 14 nights'))
    const li = host.querySelector('li')!
    expect(li.getAttribute('role')).toBe('button')
    expect(li.getAttribute('tabindex')).toBe('0')
    expect(li.getAttribute('aria-label')).toBe('Open on the map: 42 countries')
    act(() => { li.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(useStore.getState().tab).toBe('map')

    useStore.setState({ tab: 'home' })
    act(() => { li.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })) })
    expect(useStore.getState().tab).toBe('home')
    act(() => { li.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })) })
    expect(useStore.getState().tab).toBe('map')
    unmount()
  })
})
