// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { ReadyBar, readyFor } from './ReadyBar'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('readyFor', () => {
  it('maps import stages to a rising bar', () => {
    expect(['reading', 'parsing', 'cities', 'deriving', 'done'].map((s) => readyFor(s, 'import'))).toEqual([
      { label: 'Reading file', pct: 10 }, { label: 'Finding stops', pct: 35 }, { label: 'Finding cities', pct: 60 }, { label: 'Working out trips', pct: 85 }, { label: 'Working out trips', pct: 100 },
    ])
  })
  it('re-deriving starts half way', () => {
    expect(readyFor('deriving', 'rederive')).toEqual({ label: 'Working out trips', pct: 50 })
    expect(readyFor('done', 'rederive')).toEqual({ label: 'Working out trips', pct: 100 })
    expect(readyFor('nonsense', 'import')).toBeNull()
  })
})

describe('ReadyBar', () => {
  it('prints the stage and lifts off after done', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    const root = createRoot(host)
    act(() => root.render(createElement(ReadyBar, { ready: { label: 'Finding stops', pct: 35 } })))
    const bar = host.querySelector('[role=progressbar]')!
    expect(bar.getAttribute('aria-valuenow')).toBe('35')
    expect(bar.textContent).toContain('Finding stops')
    act(() => root.render(createElement(ReadyBar, { ready: { label: 'Working out trips', pct: 100 } })))
    expect(host.querySelector('[role=progressbar]')).not.toBeNull()
    await act(() => new Promise((r) => setTimeout(r, 700)))
    expect(host.querySelector('[role=progressbar]')).toBeNull()
    act(() => root.unmount())
  })
})
