// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import { ANDROID_RELEASE, Viewer } from './Viewer'

const roots: Root[] = []
const mount = (props: Partial<Parameters<typeof Viewer>[0]> = {}) => {
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host); roots.push(root)
  act(() => root.render(createElement(Viewer, { stage: null, importError: null, importFile() {}, ...props })))
  return host
}
const button = (host: HTMLElement, text: string) => [...host.querySelectorAll<HTMLElement>('.ob-actions .btn')].find((b) => b.textContent === text)
afterEach(() => { for (const r of roots.splice(0)) act(() => r.unmount()); document.body.innerHTML = '' })

describe('Viewer door', () => {
  it('says the phone keeps the record and offers the app and an export', () => {
    const host = mount()
    expect(host.querySelector('.ob .ob-title')?.textContent).toBe('Your phone keeps the record.')
    expect(host.querySelector('.lede')?.textContent).toBe('Elsewhere records on Android as you live. The web prints it.')
    const app = button(host, 'Get the Android app') as HTMLAnchorElement
    expect(app.tagName).toBe('A')
    expect(app.href).toBe(ANDROID_RELEASE)
    expect(app.target).toBe('_blank')
    expect(app.rel).toBe('noopener')
    const add = button(host, 'Add a Google Timeline export')
    expect(add?.classList.contains('quiet')).toBe(true)
    expect(add?.querySelector('input[type=file]')).not.toBeNull()
    expect(host.querySelector('.fine')?.textContent).toBe('Phone-to-web sync arrives with a later release; until then the web shows what you import here.')
  })

  it('hands the chosen file to importFile', () => {
    const importFile = vi.fn()
    const host = mount({ importFile })
    const input = host.querySelector<HTMLInputElement>('.ob-actions input[type=file]')!
    const file = new File(['{}'], 'Timeline.json', { type: 'application/json' })
    Object.defineProperty(input, 'files', { value: [file] })
    act(() => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(importFile).toHaveBeenCalledWith(file)
  })

  it('shows the stage while importing and the error when it fails', () => {
    const busy = mount({ stage: 'parsing' })
    expect(button(busy, 'Reading segments…')).toBeDefined()
    expect(busy.querySelector<HTMLInputElement>('.ob-actions input[type=file]')?.disabled).toBe(true)
    const failed = mount({ importError: new Error('Not a Timeline export') })
    expect(failed.querySelector('.ob-error')?.textContent).toBe('Not a Timeline export')
  })
})
