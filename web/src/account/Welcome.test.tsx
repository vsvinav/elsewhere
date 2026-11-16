// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const db = vi.hoisted(() => ({ store: new Map<string, unknown>() }))
vi.mock('../ingest/db', () => ({ kv: { get: async (k: string) => db.store.get(k), set: async (k: string, v: unknown) => { db.store.set(k, v) }, del: async (k: string) => { db.store.delete(k) } } }))

import { CONTINUE_WITHOUT, LOG_IN, SIGN_UP, WELCOME_LINE, Welcome } from './Welcome'
import { resetAccountForTest, useAccount } from './store'

const buttons = (host: HTMLElement) => [...host.querySelectorAll('button')]
const click = (host: HTMLElement, label: string) => act(() => buttons(host).find((b) => b.textContent === label)!.click())

beforeEach(() => { db.store.clear(); resetAccountForTest(); document.body.innerHTML = '' })

describe('Welcome', () => {
  it('shows the line and the three choices, in the agreed words', () => {
    const host = document.body.appendChild(document.createElement('div'))
    act(() => createRoot(host).render(createElement(Welcome, { onSignUp() {}, onLogIn() {}, onContinue() {} })))
    expect(WELCOME_LINE).toBe('Your life, mapped as you live it.')
    expect(host.querySelector('.lede')?.textContent).toBe(WELCOME_LINE)
    expect(buttons(host).map((b) => b.textContent)).toEqual([SIGN_UP, LOG_IN, CONTINUE_WITHOUT])
    expect([SIGN_UP, LOG_IN, CONTINUE_WITHOUT]).toEqual(['Sign up', 'Log in', 'Continue without an account'])
  })
  it('routes each choice; continuing without an account remembers that on the device', async () => {
    const onSignUp = vi.fn(), onLogIn = vi.fn(), onContinue = vi.fn()
    const host = document.body.appendChild(document.createElement('div'))
    act(() => createRoot(host).render(createElement(Welcome, { onSignUp, onLogIn, onContinue })))
    await click(host, 'Sign up'); expect(onSignUp).toHaveBeenCalledOnce()
    await click(host, 'Log in'); expect(onLogIn).toHaveBeenCalledOnce()
    expect(useAccount.getState().welcomed).toBe(false)
    await click(host, 'Continue without an account')
    expect(onContinue).toHaveBeenCalledOnce()
    expect(useAccount.getState().welcomed).toBe(true)
    await act(() => Promise.resolve())
    expect(db.store.get('welcomed')).toBe(true)
  })
})
