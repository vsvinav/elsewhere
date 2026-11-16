// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { sampleData } from '../test/sample'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
vi.hoisted(() => {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) })
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
})
vi.mock('./KeyCheck', () => ({ KeyCheck: () => null, useKeyGate: () => false }))
vi.mock('../app/NamingStamp', () => ({ NamingStamp: () => null }))

import { Onboarding } from './Onboarding'

const mount = (data: ReturnType<typeof sampleData> | null, demo: boolean) => {
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  act(() => root.render(createElement(Onboarding, { data, demo, stage: null, importError: null, importFile() {}, initial: null })))
  return host
}

describe('Onboarding front door', () => {
  it('offers the bundled demo record and skips straight to the questions', () => {
    const host = mount(sampleData(), true)
    const btn = host.querySelector<HTMLButtonElement>('.ob-demo')
    expect(host.textContent).toContain('No export yet?')
    expect(btn?.textContent).toBe('Try it with a demo record →')
    act(() => btn!.click())
    expect(host.querySelector('.ob-drop')).toBeNull()
    expect(host.querySelector('[aria-label="First name"]')).not.toBeNull()
  })

  it('has nothing to try when no record is bundled', () => {
    const host = mount(null, false)
    expect(host.querySelector('.ob-drop')).not.toBeNull()
    expect(host.querySelector('.ob-demo')).toBeNull()
  })
})

describe('Onboarding import-first, after a restored profile', () => {
  it('offers the Android app and an export in place of the dropzone and the demo', () => {
    const host = document.body.appendChild(document.createElement('div'))
    const initial = { name: 'V', units: 'km' as const, homes: [], works: [] }
    act(() => createRoot(host).render(createElement(Onboarding, { data: sampleData(), demo: true, stage: null, importError: null, importFile() {}, initial, importFirst: true })))
    expect([...host.querySelectorAll('.ob-actions .btn')].map((b) => b.textContent)).toEqual(['Get the Android app', 'Add a Google Timeline export'])
    expect(host.querySelector('.ob-drop')).toBeNull()
    expect(host.querySelector('.ob-demo')).toBeNull()
    expect(host.querySelector('[aria-label="Google Maps API key"]')).not.toBeNull()
  })
})
