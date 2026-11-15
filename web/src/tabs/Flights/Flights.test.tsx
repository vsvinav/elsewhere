// @vitest-environment jsdom
vi.hoisted(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof matchMedia
  class IO { observe() {} disconnect() {} unobserve() {} }
  window.IntersectionObserver = IO as unknown as typeof IntersectionObserver
})
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { DataContext } from '../../data/DataContext'
import { sampleData } from '../../test/sample'
import { Flights } from './Flights'

vi.mock('../../world/FlightMap', () => ({ FlightMap: ({ mode }: { mode?: string }) => createElement('div', { className: `flightmap ${mode ?? 'region'}` }) }))

test('the globe hero and the per-airport bill each carry a save menu with a text share', async () => {
  const el = document.body.appendChild(document.createElement('div'))
  const root = createRoot(el)
  await act(async () => { root.render(createElement(DataContext.Provider, { value: sampleData() }, createElement(Flights))) })
  const hero = el.querySelector('.bill.hero')!
  expect(hero.querySelector('.flightmap.globe')).not.toBeNull()
  const buttons = Array.from(hero.querySelectorAll('.save button')).map((b) => b.textContent)
  expect(buttons).toEqual(['Text', 'Save', '9:16', '4:5'])
  const airport = el.querySelectorAll('.bill')[1]
  expect(airport.querySelector('.flightmap.region')).not.toBeNull()
  expect(Array.from(airport.querySelectorAll('.save button')).map((b) => b.textContent)).toEqual(['Text', 'Save', '9:16', '4:5'])
  await act(async () => root.unmount()); el.remove()
})
