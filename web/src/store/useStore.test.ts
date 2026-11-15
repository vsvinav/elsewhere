// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from './useStore'

const back = (to: string) => { location.hash = to; useStore.getState().syncFromHash() }

beforeEach(() => { location.hash = ''; useStore.setState({ tab: 'home', settingsOpen: false }) })

describe('settings over the tabs', () => {
  it('opens at #settings and keeps the tab underneath', () => {
    useStore.getState().setTab('stats')
    useStore.getState().openSettings()
    expect(location.hash).toBe('#settings')
    expect(useStore.getState()).toMatchObject({ tab: 'stats', settingsOpen: true })
  })
  it('back from #settings closes Settings and leaves the hash alone', () => {
    useStore.getState().setTab('stats')
    useStore.getState().openSettings()
    back('stats')
    expect(useStore.getState()).toMatchObject({ tab: 'stats', settingsOpen: false })
    expect(location.hash).toBe('#stats')
  })
  it('closing returns to the tab', () => {
    useStore.getState().setTab('trips')
    useStore.getState().openSettings()
    useStore.getState().closeSettings()
    expect(location.hash).toBe('#trips')
    expect(useStore.getState().settingsOpen).toBe(false)
  })
  it('a typed #settings opens it', () => {
    back('settings')
    expect(useStore.getState().settingsOpen).toBe(true)
  })
})
