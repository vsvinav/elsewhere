import { create } from 'zustand'

export type Tab = 'home' | 'stats' | 'places' | 'trips' | 'map' | 'play'
export const TABS: Tab[] = ['home', 'stats', 'places', 'trips', 'map', 'play']
/** Replay speeds in timeline seconds per real second. */
export const SPEEDS = [900, 3600, 18000] as const
export const SPEED_LABEL: Record<number, string> = { 900: '15 min/s', 3600: '1 h/s', 18000: '5 h/s' }

export interface Store {
  tab: Tab
  setTab(t: Tab): void
  playhead: number | null
  playing: boolean
  speed: number
  follow: boolean
  basemap: 'dark' | 'light'
  hoverPlace: { id: string; x: number; y: number } | null
  setPlayhead(t: number | null): void
  setPlaying(p: boolean): void
  setSpeed(s: number): void
  setFollow(f: boolean): void
  toggleBasemap(): void
  setHoverPlace(h: Store['hoverPlace']): void
}

export const useStore = create<Store>((set) => ({
  tab: (TABS as string[]).includes(location.hash.slice(1)) ? (location.hash.slice(1) as Tab) : 'home',
  setTab: (tab) => { location.hash = tab; set({ tab, playing: tab === 'play', ...(tab === 'play' ? { follow: true } : {}) }) },
  playhead: null,
  playing: false,
  speed: 3600,
  follow: true,
  basemap: 'dark',
  hoverPlace: null,
  setPlayhead: (playhead) => set({ playhead }),
  setPlaying: (playing) => set(playing ? { playing, follow: true } : { playing }),
  setSpeed: (speed) => set({ speed }),
  setFollow: (follow) => set({ follow }),
  toggleBasemap: () => set((s) => ({ basemap: s.basemap === 'dark' ? 'light' : 'dark' })),
  setHoverPlace: (hoverPlace) => set({ hoverPlace }),
}))
