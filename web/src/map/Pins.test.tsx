// @vitest-environment jsdom
vi.hoisted(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { DataContext } from '../data/DataContext'
import { sampleData } from '../test/sample'
import { useStore } from '../store/useStore'

vi.mock('../world/PlacePhoto', () => ({ PlacePhoto: () => createElement('div', { className: 'photo' }) }))

import { PinHud } from './Pins'

const data = sampleData()
const mount = () => {
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  act(() => root.render(createElement(DataContext.Provider, { value: data }, createElement(PinHud))))
  return { host, root }
}
const click = (el: Element) => act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))

beforeEach(() => useStore.setState({ heat: false, pin: null, hiddenCats: [] }))

test('HEAT switches the heat view on, shows the legend, and switches it back off', () => {
  const setHeat = vi.spyOn(useStore.getState(), 'setHeat')
  const { host, root } = mount()
  const btn = host.querySelector('button.pins-heat')!
  expect(btn.textContent).toBe('HEAT')
  expect(btn.getAttribute('aria-pressed')).toBe('false')
  expect(btn.getAttribute('title')).toBe('Show where you go most')
  expect(host.querySelector('.heat-legend')).toBeNull()

  click(btn)
  expect(setHeat).toHaveBeenCalledWith(true)
  expect(useStore.getState().heat).toBe(true)
  expect(btn.getAttribute('aria-pressed')).toBe('true')
  expect(btn.classList.contains('on')).toBe(true)
  const legend = host.querySelector('.heat-legend')!
  expect(legend).not.toBeNull()
  expect(legend.getAttribute('aria-label')).toBe('Cool to warm: warmest where you go most')
  expect(legend.textContent).toContain('COOL')
  expect(legend.textContent).toContain('WARM')
  const bar = legend.querySelector<HTMLElement>('.heat-bar')!
  expect(bar.style.background.startsWith('linear-gradient(90deg')).toBe(true)

  click(btn)
  expect(setHeat).toHaveBeenLastCalledWith(false)
  expect(btn.getAttribute('aria-pressed')).toBe('false')
  expect(host.querySelector('.heat-legend')).toBeNull()
  act(() => root.unmount())
  host.remove()
})
