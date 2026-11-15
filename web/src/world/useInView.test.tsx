// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { useInView } from './useInView'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Card({ onVisible }: { onVisible(): void }) {
  const ref = useInView<HTMLDivElement>(onVisible)
  return createElement('div', { ref })
}

describe('useInView', () => {
  it('fires once when the element intersects', () => {
    let cb: ((e: { isIntersecting: boolean }[]) => void) | null = null
    const disconnect = vi.fn()
    class IO { constructor(f: typeof cb) { cb = f } observe() {} disconnect = disconnect; unobserve() {} }
    vi.stubGlobal('IntersectionObserver', IO)
    const seen = vi.fn()
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    act(() => root.render(createElement(Card, { onVisible: seen })))
    expect(seen).not.toHaveBeenCalled()
    act(() => cb!([{ isIntersecting: false }]))
    expect(seen).not.toHaveBeenCalled()
    act(() => cb!([{ isIntersecting: true }]))
    act(() => cb!([{ isIntersecting: true }]))
    expect(seen).toHaveBeenCalledTimes(1)
    expect(disconnect).toHaveBeenCalled()
    act(() => root.unmount())
    vi.unstubAllGlobals()
  })
  it('fires straight away where there is no IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const seen = vi.fn()
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    act(() => root.render(createElement(Card, { onVisible: seen })))
    expect(seen).toHaveBeenCalledTimes(1)
    act(() => root.unmount())
    vi.unstubAllGlobals()
  })
})
