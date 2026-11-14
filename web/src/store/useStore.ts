import { useEffect, useState } from 'react'
import { create } from 'zustand'
import type { Lens } from '../analytics/lens'

export type Tab = 'home' | 'stats' | 'places' | 'trips' | 'flights' | 'map' | 'play'
export const TABS: Tab[] = ['home', 'stats', 'places', 'trips', 'flights', 'map', 'play']
/** Replay pace: multiplier on the per-segment timing (each leg plays for a few seconds, each stay for about one). */

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

export const useStore = create<Store>((set) => ({
  tab: (TABS as string[]).includes(location.hash.slice(1)) ? (location.hash.slice(1) as Tab) : 'home',
  setTab: (tab) => { location.hash = tab; set({ tab, playing: tab === 'play', ...(tab === 'play' ? { follow: true } : {}) }) },
  playhead: null,
  playing: false,
  speed: 1,
  rate: 3600,
  setRate: (rate) => set({ rate }),
  follow: true,
  lens: 'all',
  setLens: (lens) => set({ lens }),
  range: null,
  setRange: (range) => set({ range, playhead: range ? range[0] : null }),
  hoverPlace: null,
  setPlayhead: (playhead) => set({ playhead }),
  setPlaying: (playing) => set(playing ? { playing, follow: true } : { playing }),
  setSpeed: (speed) => set({ speed }),
  setFollow: (follow) => set({ follow }),
  setHoverPlace: (hoverPlace) => set({ hoverPlace }),
}))
