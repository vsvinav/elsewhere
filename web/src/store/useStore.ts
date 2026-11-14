import { create } from 'zustand'

export type InsightId = 'replay' | 'wrapped' | 'explore' | 'commute'
export type Speed = 1 | 10 | 100

export interface Store {
  timeRange: [number, number]
  playhead: number | null
  playing: boolean
  speed: Speed
  activeInsight: InsightId
  selectedPlaceId: string | null
  basemap: 'dark' | 'light'
  follow: boolean
  setTimeRange(r: [number, number]): void
  setPlayhead(t: number | null): void
  setPlaying(p: boolean): void
  setSpeed(s: Speed): void
  setInsight(i: InsightId): void
  selectPlace(id: string | null): void
  toggleBasemap(): void
  setFollow(f: boolean): void
}

export const useStore = create<Store>((set) => ({
  timeRange: [0, 0],
  playhead: null,
  playing: false,
  speed: 10,
  activeInsight: 'replay',
  selectedPlaceId: null,
  basemap: 'dark',
  follow: true,
  setTimeRange: (timeRange) => set({ timeRange }),
  setPlayhead: (playhead) => set({ playhead }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setInsight: (activeInsight) => set({ activeInsight }),
  selectPlace: (selectedPlaceId) => set({ selectedPlaceId }),
  setFollow: (follow) => set({ follow }),
  toggleBasemap: () => set((s) => ({ basemap: s.basemap === 'dark' ? 'light' : 'dark' })),
}))
