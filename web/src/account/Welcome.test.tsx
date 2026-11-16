// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const db = vi.hoisted(() => ({ store: new Map<string, unknown>() }))
vi.mock('../ingest/db', () => ({ kv: { get: async (k: string) => db.store.get(k), set: async (k: string, v: unknown) => { db.store.set(k, v) }, del: async (k: string) => { db.store.delete(k) } } }))

import { CONTINUE_WITHOUT, LOG_IN, NOT_NOW, SIGN_UP, WELCOME_LINE, Welcome } from './Welcome'
import { POINTS, TOTAL } from './route'
import { resetAccountForTest, useAccount } from './store'

let reduced = false
window.matchMedia = ((q: string) => ({ matches: reduced && q.includes('reduce'), addEventListener() {}, removeEventListener() {} })) as unknown as typeof matchMedia

const buttons = (host: HTMLElement) => [...host.querySelectorAll('button')]
const click = (host: HTMLElement, label: string) => act(() => buttons(host).find((b) => b.textContent === label)!.click())

beforeEach(() => { db.store.clear(); resetAccountForTest(); document.body.innerHTML = ''; reduced = false })
const roots: Root[] = []
afterEach(() => { for (const r of roots.splice(0)) act(() => r.unmount()); vi.restoreAllMocks(); vi.useRealTimers() })
const mount = (props: Partial<Parameters<typeof Welcome>[0]> = {}) => {
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host); roots.push(root)
  act(() => root.render(createElement(Welcome, { onSignUp() {}, onLogIn() {}, onContinue() {}, ...props })))
  return host
}
const counter = (host: HTMLElement) => host.querySelector('.sk-km')?.textContent
const labels = (host: HTMLElement) => [...host.querySelectorAll('.sk-pin b')].map((b) => b.textContent)

describe('Welcome', () => {
  it('shows the line and the three choices, in the agreed words', () => {
    const host = mount()
    expect(WELCOME_LINE).toBe('Your life, mapped as you live it.')
    expect(host.querySelector('.lede')?.textContent).toBe(WELCOME_LINE)
    expect(buttons(host).map((b) => b.textContent)).toEqual([SIGN_UP, LOG_IN, CONTINUE_WITHOUT])
    expect([SIGN_UP, LOG_IN, CONTINUE_WITHOUT]).toEqual(['Sign up', 'Log in', 'Continue without an account'])
  })
  it('routes each choice; continuing without an account remembers that on the device', async () => {
    const onSignUp = vi.fn(), onLogIn = vi.fn(), onContinue = vi.fn()
    const host = mount({ onSignUp, onLogIn, onContinue })
    await click(host, 'Sign up'); expect(onSignUp).toHaveBeenCalledOnce()
    await click(host, 'Log in'); expect(onLogIn).toHaveBeenCalledOnce()
    expect(useAccount.getState().welcomed).toBe(false)
    await click(host, 'Continue without an account')
    expect(onContinue).toHaveBeenCalledOnce()
    expect(useAccount.getState().welcomed).toBe(true)
    await act(() => Promise.resolve())
    expect(db.store.get('welcomed')).toBe(true)
  })
  it('shows "Not now" once the device has been welcomed, and closes without touching the flag', async () => {
    useAccount.setState({ welcomed: true })
    const onContinue = vi.fn()
    const host = mount({ onContinue })
    expect(buttons(host).map((b) => b.textContent)).toEqual([SIGN_UP, LOG_IN, NOT_NOW])
    expect(NOT_NOW).toBe('Not now')
    await click(host, NOT_NOW)
    expect(onContinue).toHaveBeenCalledOnce()
    expect(useAccount.getState().welcomed).toBe(true)
    await act(() => Promise.resolve())
    expect(db.store.has('welcomed')).toBe(false)
  })
})

describe('Welcome sketch', () => {
  it('pins every stop on the demo route, names only HOME during the hold, and starts the counter at zero', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    const host = mount()
    expect(host.querySelectorAll('.sk-pin').length).toBe(POINTS.length)
    expect(labels(host)).toEqual(['HOME'])
    expect(counter(host)).toBe('0')
    expect(host.querySelectorAll('.sk-stamp').length).toBe(1)
    expect(host.querySelectorAll('.ob-mark').length).toBe(1)
  })
  it('draws the route over 6.4 s, counting up to 14,920 km and landing five stamps, then stops asking for frames', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    const host = mount()
    act(() => { vi.advanceTimersByTime(1000) })
    const mid = counter(host)!.replace(',', '')
    expect(Number(mid)).toBeGreaterThan(0)
    expect(Number(mid)).toBeLessThan(420)
    act(() => { vi.advanceTimersByTime(TOTAL) })
    expect(counter(host)).toBe('14,920')
    expect(host.querySelectorAll('.sk-stamp').length).toBe(6)
    expect(labels(host)).toEqual(POINTS.map((p) => p.label))
    const calls = raf.mock.calls.length
    act(() => { vi.advanceTimersByTime(1000) })
    expect(raf.mock.calls.length).toBe(calls)
  })
  it('with reduced motion prints the finished sketch at once and never asks for a frame', () => {
    reduced = true
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    const host = mount()
    expect(counter(host)).toBe('14,920')
    expect(host.querySelectorAll('.sk-stamp').length).toBe(6)
    expect(labels(host)).toEqual(POINTS.map((p) => p.label))
    expect(raf).not.toHaveBeenCalled()
  })
})
