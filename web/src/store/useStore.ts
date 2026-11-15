import { useEffect, useState } from 'react'
import { create } from 'zustand'
import type { Lens } from '../analytics/lens'
import type { Cat } from '../analytics/category'

export type Tab = 'home' | 'stats' | 'facts' | 'places' | 'trips' | 'flights' | 'map' | 'play'
export const TABS: Tab[] = ['home', 'stats', 'facts', 'places', 'trips', 'flights', 'map', 'play']
/** Replay pace: multiplier on the per-segment timing (each leg plays for a few seconds, each stay for about one). */

/** Where a readable figure leads: a date window, one pin, a trip, or a set of pins. */
export type Door =
  | { kind: 'range'; from: number; to: number; label: string }
  | { kind: 'place'; placeId: string; at?: number; label: string }
  | { kind: 'trip'; tripId: string; from: number; to: number; label: string }
  | { kind: 'places'; placeIds: string[]; label: string }
/** The figure the reader walked through, and the way back to it. */
/** `key` is stamped on the history entry the door pushed, so going back can tell whether that entry is still on top. */
export interface Origin { label: string; backTab: Tab; scrollY: number; key: number }
/** What the Map frames once its camera is live: these pins, or every pin in the range when `ids` is null. `n` bumps per door. */
export interface Focus { ids: string[] | null; n: number }

export interface Store {
  tab: Tab
  setTab(t: Tab): void
  playhead: number | null
  playing: boolean
  speed: number
  /** Current replay rate in timeline seconds per real second; set by playback each frame. */
  rate: number
  setRate(r: number): void
  follow: boolean
  /** Movement lens; Play cuts between matching legs, the map draws only that ink. */
  lens: Lens
  setLens(l: Lens): void
  /** Kinds of stop switched off on the Map tab. */
  hiddenCats: Cat[]
  toggleCat(c: Cat): void
  setHiddenCats(c: Cat[]): void
  /** Map tab: the pin whose tag is open, and what sets a pin's size. */
  pin: string | null
  setPin(id: string | null): void
  pinSize: 'visits' | 'hours'
  setPinSize(k: 'visits' | 'hours'): void
  /** Date filter applied to every tab; null is the whole record. */
  range: [number, number] | null
  setRange(r: [number, number] | null): void
  hoverPlace: { id: string; x: number; y: number } | null
  setPlayhead(t: number | null): void
  setPlaying(p: boolean): void
  setSpeed(s: number): void
  setFollow(f: boolean): void
  setHoverPlace(h: Store['hoverPlace']): void
  /** Walk through a figure: open the map on what made it, remembering the way back. */
  goTo(door: Door): void
  /** Return to the tab the door was on, stepping the history back if the door is still its latest entry; the caller restores the scroll. */
  goBack(): void
  /** Leave the door's view in state only, for when the history has already moved. Returns the origin left behind. */
  leaveDoor(): Origin | null
  origin: Origin | null
  focus: Focus | null
}

/** Playhead sampled at most every `ms`; HUD, sky and tags read this so the per-frame tick never re-renders React. */
export function useThrottledPlayhead(ms: number): number | null {
  const [v, setV] = useState(() => useStore.getState().playhead)
  useEffect(() => {
    let last = 0, pending: number | null | undefined
    let timer = 0
    const unsub = useStore.subscribe((s) => {
      if (s.playhead === pending) return
      pending = s.playhead
      const wait = ms - (performance.now() - last)
      if (wait <= 0) { last = performance.now(); setV(pending) }
      else if (!timer) timer = window.setTimeout(() => { timer = 0; last = performance.now(); setV(useStore.getState().playhead) }, wait)
    })
    return () => { unsub(); clearTimeout(timer) }
  }, [ms])
  return v
}

const onMap = (t: Tab) => t === 'map' || t === 'play'
/** State for landing on a tab: the replay starts following; walking off the map by the nav leaves a door's origin and framing behind. */
const entering = (tab: Tab): Partial<Store> => ({ tab, playing: tab === 'play', ...(tab === 'play' ? { follow: true } : {}), ...(onMap(tab) ? {} : { origin: null, focus: null }) })

export const useStore = create<Store>((set, get) => ({
  tab: (TABS as string[]).includes(location.hash.slice(1)) ? (location.hash.slice(1) as Tab) : 'home',
  // Walking off the map by the nav leaves the door's origin and framing behind.
  setTab: (tab) => { location.hash = tab; set(entering(tab)) },
  playhead: null,
  playing: false,
  speed: 1,
  rate: 3600,
  setRate: (rate) => set({ rate }),
  follow: true,
  lens: 'all',
  setLens: (lens) => set({ lens }),
  hiddenCats: [],
  toggleCat: (c) => set((s) => ({ hiddenCats: s.hiddenCats.includes(c) ? s.hiddenCats.filter((x) => x !== c) : [...s.hiddenCats, c] })),
  setHiddenCats: (hiddenCats) => set({ hiddenCats }),
  pin: null,
  // Only picking a different pin counts as leaving the door; closing the card or re-tapping it does not.
  setPin: (pin) => set((s) => (pin && pin !== s.pin ? { pin, origin: null, focus: null } : { pin })),
  pinSize: 'visits',
  setPinSize: (pinSize) => set({ pinSize }),
  range: null,
  setRange: (range) => set({ range, playhead: range ? range[0] : null, origin: null, focus: null }),
  hoverPlace: null,
  setPlayhead: (playhead) => set({ playhead }),
  setPlaying: (playing) => set(playing ? { playing, follow: true } : { playing }),
  setSpeed: (speed) => set({ speed }),
  setFollow: (follow) => set({ follow }),
  setHoverPlace: (hoverPlace) => set({ hoverPlace }),
  origin: null,
  focus: null,
  goTo: (door) => {
    const s = get()
    // A door opened from the map itself keeps the first way back.
    const n = (s.focus?.n ?? 0) + 1
    const origin: Origin = onMap(s.tab) && s.origin ? { ...s.origin, label: door.label } : { label: door.label, backTab: onMap(s.tab) ? 'home' : s.tab, scrollY: onMap(s.tab) ? 0 : window.scrollY, key: n }
    location.hash = 'map'
    history.replaceState({ door: origin.key }, '')
    const base = { tab: 'map' as Tab, playing: false, origin }
    switch (door.kind) {
      case 'range':
      case 'trip':
        set({ ...base, range: [door.from, door.to], playhead: door.from, pin: null, focus: { ids: null, n } }); break
      case 'place':
        set({ ...base, pin: door.placeId, playhead: door.at ?? s.playhead, hiddenCats: [], focus: { ids: [door.placeId], n } }); break
      case 'places':
        set({ ...base, pin: null, hiddenCats: [], focus: { ids: door.placeIds, n } }); break
    }
  },
  leaveDoor: () => {
    const o = get().origin
    if (o) set({ tab: o.backTab, playing: false, origin: null, focus: null })
    return o
  },
  goBack: () => {
    const o = get().leaveDoor()
    if (!o) return
    if ((history.state as { door?: number } | null)?.door === o.key) history.back()
    else history.replaceState(null, '', `#${o.backTab}`)
  },
}))

/**
 * Mirror the address bar into the store after the browser moves through history. An empty hash is the front door:
 * a fresh load never writes one, so Back from the first door lands there. Returning through a door's origin also
 * restores where the reader was on the page.
 */
export function syncTabFromHash() {
  const t = (location.hash.slice(1) || 'home') as Tab
  const { tab, origin, leaveDoor } = useStore.getState()
  if (t === tab) return
  if (origin && t === origin.backTab) {
    leaveDoor()
    requestAnimationFrame(() => requestAnimationFrame(() => scrollTo({ top: origin.scrollY })))
  } else if ((TABS as readonly string[]).includes(t)) useStore.setState(entering(t)) // the address bar already moved; writing it back would push over the Forward entry
}
