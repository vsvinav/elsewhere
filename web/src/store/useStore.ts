import { create } from 'zustand'
import type { Bounds } from '../analytics/geo'

export type InsightId = 'replay' | 'wrapped' | 'explore' | 'commute'
export type Speed = 1 | 10 | 100
export type Tab = 'home' | 'stats' | 'places' | 'trips' | 'map' | 'play'
export const TABS: Tab[] = ['home', 'stats', 'places', 'trips', 'map', 'play']

export interface Store {
  tab: Tab
  setTab(t: Tab): void
  timeRange: [number, number]
  playhead: number | null
  playing: boolean
  speed: Speed
  activeInsight: InsightId
  selectedPlaceId: string | null
  basemap: 'dark' | 'light'
  follow: boolean
  /** One-shot camera request from an insight; nonce makes repeat targets re-fire. */
  camera: { bounds: Bounds; nonce: number } | null
  setTimeRange(r: [number, number]): void
  setPlayhead(t: number | null): void
  setPlaying(p: boolean): void
  setSpeed(s: Speed): void
  setInsight(i: InsightId): void
  selectPlace(id: string | null): void
  toggleBasemap(): void
  setFollow(f: boolean): void
  flyTo(bounds: Bounds | null): void
}

export const useStore = create<Store>((set) => ({
  tab: (TABS as string[]).includes(location.hash.slice(1)) ? (location.hash.slice(1) as Tab) : 'home',
  setTab: (tab) => { location.hash = tab; set({ tab, playing: tab === 'play' }) },
  timeRange: [0, 0],
  playhead: null,
  playing: false,
  speed: 10,
  activeInsight: 'replay',
  selectedPlaceId: null,
  basemap: 'dark',
  follow: true,
  camera: null,
  setTimeRange: (timeRange) => set({ timeRange }),
  setPlayhead: (playhead) => set({ playhead }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setInsight: (activeInsight) => set({ activeInsight, playing: false }),
  selectPlace: (selectedPlaceId) => set({ selectedPlaceId }),
  setFollow: (follow) => set({ follow }),
  flyTo: (bounds) => set((s) => ({ camera: bounds ? { bounds, nonce: (s.camera?.nonce ?? 0) + 1 } : null })),
  toggleBasemap: () => set((s) => ({ basemap: s.basemap === 'dark' ? 'light' : 'dark' })),
}))
