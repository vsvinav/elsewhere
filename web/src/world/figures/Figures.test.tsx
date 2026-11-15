// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Dial } from './Figures'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const render = (el: ReturnType<typeof createElement>) => {
  const host = document.body.appendChild(document.createElement('div'))
  act(() => createRoot(host).render(el))
  return host
}

describe('Dial', () => {
  const hours = Array.from({ length: 24 }, (_, h) => (h === 8 ? 9 : h === 18 ? 4 : 0))

  it('is labelled like a normal clock, 12 at the top', () => {
    const host = render(createElement(Dial, { hours, hand: 18.5, arc: [22, 28], label: '18:30' }))
    const labels = Array.from(host.querySelectorAll('text.l')).map((t) => t.textContent)
    expect(labels).toEqual(['12', '3', '6', '9'])
    expect(host.textContent).not.toContain('18 ')
    expect(host.textContent).not.toContain('00')
    const twelve = host.querySelector('text.l')!
    const svgCentreY = 70
    expect(Number(twelve.getAttribute('y'))).toBeLessThan(svgCentreY)
    expect(host.querySelector('svg')!.getAttribute('aria-label')).toBe('Clock pointing at 18:30')
  })

  it('tags the headline with AM or PM and keeps the caller’s label', () => {
    const pm = render(createElement(Dial, { hours, hand: 18.5, label: '18:30' }))
    expect(pm.querySelector('text.dial-n')!.textContent).toBe('18:30PM')
    expect(pm.querySelector('.dial-ampm')!.textContent).toBe('PM')
    const am = render(createElement(Dial, { hours, hand: 7.25, label: '07:15' }))
    expect(am.querySelector('.dial-ampm')!.textContent).toBe('AM')
  })

  it('draws the arc in red and bars on two rings', () => {
    const host = render(createElement(Dial, { hours, hand: 7, arc: [22, 28], label: '07:00' }))
    expect(host.querySelector('path.c-red')).not.toBeNull()
    expect(host.querySelectorAll('line.dial-bar.am')).toHaveLength(1)
    expect(host.querySelectorAll('line.dial-bar.pm')).toHaveLength(1)
  })
})
