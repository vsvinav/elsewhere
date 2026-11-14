import { useSyncExternalStore } from 'react'

export interface Home { lat: number; lng: number; city: string; cc: string; from: number; to: number | null; name?: string }
export interface Work { lat: number; lng: number; place_id: string }
export interface Profile { name: string | null; units: 'km' | 'mi'; homes: Home[]; work: Work | null }

/** The home active at `ts`; homes sorted by `from`. Before the first window → first home. */
export function homeAt(homes: Home[], ts: number): Home {
  let cur = homes[0]
  for (const h of homes) if (h.from <= ts) cur = h
  return cur
}

const LS = 'elsewhere.profile'
const read = (): Profile | null => { try { return JSON.parse(localStorage.getItem(LS) ?? 'null') } catch { return null } }
let cur: Profile | null = typeof localStorage === 'undefined' ? null : read()
const subs = new Set<() => void>()
export const profile = {
  get: () => cur,
  set: (p: Profile | null) => { cur = p; if (p) localStorage.setItem(LS, JSON.stringify(p)); else localStorage.removeItem(LS); subs.forEach((f) => f()) },
  subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f) } },
}
export const useProfile = () => useSyncExternalStore(profile.subscribe, profile.get)
