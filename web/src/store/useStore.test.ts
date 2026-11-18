// @vitest-environment jsdom
import { TABS, useStore, type Door } from './useStore'
const syncTabFromHash = () => useStore.getState().syncFromHash()

const reset = () => { location.hash = 'home'; useStore.setState({ tab: 'home', range: null, pin: null, playhead: null, origin: null, focus: null, hiddenCats: ['food'] as never, playing: false }) }

beforeEach(reset)

describe('goTo', () => {
  it('range: cuts the record to the window, parks the playhead at its start and opens the map', () => {
    Object.defineProperty(window, 'scrollY', { value: 420, configurable: true })
    useStore.getState().goTo({ kind: 'range', from: 100, to: 200, label: 'Lisbon · 14 nights' })
    const s = useStore.getState()
    expect(s.tab).toBe('map')
    expect(location.hash).toBe('#map')
    expect(s.range).toEqual([100, 200])
    expect(s.playhead).toBe(100)
    expect(s.pin).toBeNull()
    expect(s.origin).toMatchObject({ label: 'Lisbon · 14 nights', backTab: 'home', scrollY: 420 })
    // Every pin in the window gets framed.
    expect(s.focus).toMatchObject({ ids: null })
  })

  it('place: opens the pin, optionally moves the playhead, and frames that pin alone', () => {
    useStore.setState({ tab: 'facts', range: [1, 2] })
    useStore.getState().goTo({ kind: 'place', placeId: 'cafe', at: 150, label: 'Café Central · 42 visits' })
    const s = useStore.getState()
    expect(s.tab).toBe('map')
    expect(s.pin).toBe('cafe')
    expect(s.playhead).toBe(150)
    expect(s.range).toEqual([1, 2])
    expect(s.focus).toMatchObject({ ids: ['cafe'] })
    expect(s.origin?.backTab).toBe('facts')
    // Hidden kinds come back so the pin the reader asked for is on the map.
    expect(s.hiddenCats).toEqual([])
  })

  it('trip: sets the trip window and frames every pin inside it', () => {
    useStore.setState({ tab: 'stats' })
    useStore.getState().goTo({ kind: 'trip', tripId: '10-20', from: 10, to: 20, label: 'Longest trip · 9 nights' })
    const s = useStore.getState()
    expect(s.range).toEqual([10, 20])
    expect(s.focus).toMatchObject({ ids: null })
    expect(s.origin?.backTab).toBe('stats')
  })

  it('places: frames a set of pins and leaves the range alone', () => {
    useStore.getState().goTo({ kind: 'places', placeIds: ['a', 'b', 'c'], label: '3 countries' })
    const s = useStore.getState()
    expect(s.range).toBeNull()
    expect(s.pin).toBeNull()
    expect(s.focus).toMatchObject({ ids: ['a', 'b', 'c'] })
  })

  it('each door bumps the focus so the map re-frames even for the same pins', () => {
    const d: Door = { kind: 'places', placeIds: ['a'], label: 'one' }
    useStore.getState().goTo(d)
    const n1 = useStore.getState().focus!.n
    useStore.getState().goTo(d)
    expect(useStore.getState().focus!.n).toBe(n1 + 1)
  })

  it('a door opened from the map keeps the first origin\'s way back', () => {
    useStore.setState({ tab: 'facts' })
    useStore.getState().goTo({ kind: 'places', placeIds: ['a'], label: 'first' })
    useStore.getState().goTo({ kind: 'places', placeIds: ['b'], label: 'second' })
    expect(useStore.getState().origin).toMatchObject({ label: 'second', backTab: 'facts' })
  })
})

describe('origin', () => {
  it('goBack returns to the tab the door was on and drops the tag', () => {
    useStore.setState({ tab: 'stats' })
    useStore.getState().goTo({ kind: 'range', from: 1, to: 2, label: 'x' })
    useStore.getState().goBack()
    expect(useStore.getState().tab).toBe('stats')
    expect(useStore.getState().origin).toBeNull()
    expect(useStore.getState().focus).toBeNull()
  })

  it('dismisses when the reader changes the range or the pin by hand', () => {
    useStore.getState().goTo({ kind: 'range', from: 1, to: 2, label: 'x' })
    useStore.getState().setRange([5, 6])
    expect(useStore.getState().origin).toBeNull()
    expect(useStore.getState().focus).toBeNull()

    useStore.getState().goTo({ kind: 'place', placeId: 'a', label: 'y' })
    expect(useStore.getState().origin).not.toBeNull()
    useStore.getState().setPin('b')
    expect(useStore.getState().origin).toBeNull()
  })

  it('stays while the reader only pans or switches to the replay', () => {
    useStore.getState().goTo({ kind: 'range', from: 1, to: 2, label: 'x' })
    useStore.getState().setPlayhead(3)
    useStore.getState().setTab('play')
    expect(useStore.getState().origin).not.toBeNull()
  })

  it('is left behind when the reader walks off the map by the nav', () => {
    useStore.getState().goTo({ kind: 'places', placeIds: ['a', 'b'], label: 'x' })
    useStore.getState().setTab('stats')
    expect(useStore.getState().origin).toBeNull()
    expect(useStore.getState().focus).toBeNull()
  })

  it('survives closing the pin card or tapping empty map, and re-picking the same pin', () => {
    useStore.getState().goTo({ kind: 'place', placeId: 'a', label: 'y' })
    useStore.getState().setPin(null)
    expect(useStore.getState().origin).not.toBeNull()
    expect(useStore.getState().pin).toBeNull()
    useStore.getState().goTo({ kind: 'place', placeId: 'a', label: 'y' })
    useStore.getState().setPin('a')
    expect(useStore.getState().origin).not.toBeNull()
  })

  it('goBack walks the history back one step when the door is still the latest entry', () => {
    useStore.setState({ tab: 'stats' })
    const back = vi.spyOn(history, 'back').mockImplementation(() => {})
    const replace = vi.spyOn(history, 'replaceState')
    useStore.getState().goTo({ kind: 'range', from: 1, to: 2, label: 'x' })
    useStore.getState().goBack()
    expect(back).toHaveBeenCalledTimes(1)
    expect(replace).not.toHaveBeenCalledWith(null, '', '#stats')
    expect(useStore.getState().tab).toBe('stats')

    // Once something else has been pushed on top, the tab is rewritten in place instead.
    useStore.getState().goTo({ kind: 'range', from: 1, to: 2, label: 'x' })
    history.pushState(null, '', '#map')
    useStore.getState().goBack()
    expect(back).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith(null, '', '#stats')
    back.mockRestore(); replace.mockRestore()
  })
})

describe('browser Back', () => {
  it('returns to the figure from a fresh load that never wrote a hash', () => {
    history.replaceState(null, '', location.pathname)
    useStore.setState({ tab: 'home' })
    useStore.getState().goTo({ kind: 'range', from: 1, to: 2, label: 'x' })
    expect(location.hash).toBe('#map')
    history.replaceState(null, '', location.pathname)
    syncTabFromHash()
    const s = useStore.getState()
    expect(s.tab).toBe('home')
    expect(s.origin).toBeNull()
    expect(s.focus).toBeNull()
  })

  it('follows a hash to another tab, and ignores a hash for the tab already open', () => {
    useStore.getState().goTo({ kind: 'range', from: 1, to: 2, label: 'x' })
    history.replaceState(null, '', '#stats')
    syncTabFromHash()
    expect(useStore.getState().tab).toBe('stats')
    expect(useStore.getState().origin).toBeNull()
    const before = useStore.getState()
    syncTabFromHash()
    expect(useStore.getState()).toBe(before)
  })

  it('never writes the hash while mirroring it, so the Forward entry survives', () => {
    useStore.setState({ tab: 'map' })
    history.replaceState(null, '', location.pathname)
    const before = history.length
    const hash = vi.spyOn(history, 'pushState')
    syncTabFromHash()
    expect(useStore.getState().tab).toBe('home')
    expect(location.hash).toBe('')
    expect(history.length).toBe(before)
    expect(hash).not.toHaveBeenCalled()
    hash.mockRestore()
  })
})

const back = (to: string) => { location.hash = to; useStore.getState().syncFromHash() }

beforeEach(() => { location.hash = ''; useStore.setState({ tab: 'home', settingsOpen: false, origin: null }) })

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

describe('crew as a tab', () => {
  it('is the ninth tab, after Replay, and opens at #crew, closing Settings if that was open', () => {
    expect(TABS).toEqual(['home', 'stats', 'facts', 'places', 'trips', 'flights', 'map', 'play', 'crew'])
    useStore.getState().setTab('map')
    useStore.getState().openSettings()
    useStore.getState().setTab('crew')
    expect(location.hash).toBe('#crew')
    expect(useStore.getState()).toMatchObject({ tab: 'crew', settingsOpen: false })
  })
  it('a typed #crew lands on it and moving to another tab leaves it', () => {
    back('crew')
    expect(useStore.getState().tab).toBe('crew')
    back('stats')
    expect(useStore.getState().tab).toBe('stats')
  })
})

describe('grain', () => {
  it('is derived until set and forgets itself when the range changes', () => {
    useStore.getState().setGrain('day')
    expect(useStore.getState().grain).toBe('day')
    useStore.getState().setRange([0, 86400 * 500])
    expect(useStore.getState().grain).toBeNull()
  })
  it('scrubbing is a flag', () => {
    useStore.getState().setScrubbing(true)
    expect(useStore.getState().scrubbing).toBe(true)
  })
})
