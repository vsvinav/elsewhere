import { create } from 'zustand'

/** Card index lives outside the main store so the map layer and panel agree without prop drilling. */
export const useWrapped = create<{ index: number; setIndex(i: number): void }>((set) => ({
  index: 0,
  setIndex: (index) => set({ index }),
}))
