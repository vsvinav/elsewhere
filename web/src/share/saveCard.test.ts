// @vitest-environment jsdom
import { printable } from './saveCard'

const el = (tag: string, cls = '') => { const e = document.createElement(tag); if (cls) e.className = cls; return e }

describe('printable', () => {
  it('keeps the poster and drops the controls', () => {
    expect(printable(el('p'))).toBe(true)
    expect(printable(el('div', 'yearwheel dragging'))).toBe(false)
    expect(printable(el('button'))).toBe(false)
    expect(printable(el('div', 'save'))).toBe(false)
    expect(printable(document.createTextNode('2024'))).toBe(true)
  })
})
