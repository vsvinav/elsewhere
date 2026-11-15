import { useEffect, useState } from 'react'
import { create } from 'zustand'
import type { Lens } from '../analytics/lens'
import type { Cat } from '../analytics/category'

export type Tab = 'home' | 'stats' | 'facts' | 'places' | 'trips' | 'flights' | 'map' | 'play'
export const TABS: Tab[] = ['home', 'stats', 'facts', 'places', 'trips', 'flights', 'map', 'play']
/** Replay pace: multiplier on the per-segment timing (each leg plays for a few seconds, each stay for about one). */

/** Hash for the Settings page; not a tab, it sits over whichever tab was open. */
export const SETTINGS_HASH = 'settings'

export interface Store {
  tab: Tab
  setTab(t: Tab): void
  /** Settings is a page over the current tab; closing it returns there. */
  settingsOpen: boolean
  openSettings(): void
  closeSettings(): void
  /** Follow the address bar after the visitor navigates (back button, typed hash). */
  syncFromHash(): void
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

export const useStore = create<Store>((set, get) => ({
  tab: (TABS as string[]).includes(location.hash.slice(1)) ? (location.hash.slice(1) as Tab) : 'home',
  setTab: (tab) => { location.hash = tab; set({ tab, settingsOpen: false, playing: tab === 'play', ...(tab === 'play' ? { follow: true } : {}) }) },
  settingsOpen: location.hash.slice(1) === SETTINGS_HASH,
  openSettings: () => { location.hash = SETTINGS_HASH; set({ settingsOpen: true, playing: false }) },
  closeSettings: () => set((s) => { location.hash = s.tab; return { settingsOpen: false } }),
  syncFromHash: () => {
    const t = location.hash.slice(1)
    const s = get()
    if (t === SETTINGS_HASH) { if (!s.settingsOpen) s.openSettings() }
    else if ((TABS as string[]).includes(t) && t !== s.tab) s.setTab(t as Tab)
    else if (s.settingsOpen) set({ settingsOpen: false })
  },
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
  setPin: (pin) => set({ pin }),
  pinSize: 'visits',
  setPinSize: (pinSize) => set({ pinSize }),
  range: null,
  setRange: (range) => set({ range, playhead: range ? range[0] : null }),
  hoverPlace: null,
  setPlayhead: (playhead) => set({ playhead }),
  setPlaying: (playing) => set(playing ? { playing, follow: true } : { playing }),
  setSpeed: (speed) => set({ speed }),
  setFollow: (follow) => set({ follow }),
  setHoverPlace: (hoverPlace) => set({ hoverPlace }),
}))
