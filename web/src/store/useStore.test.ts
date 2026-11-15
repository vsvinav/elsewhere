// @vitest-environment jsdom
import { useStore, type Door } from './useStore'

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
    expect(s.origin).toEqual({ label: 'Lisbon · 14 nights', backTab: 'home', scrollY: 420 })
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
})
