import { useSyncExternalStore } from 'react'

export interface Home { lat: number; lng: number; city: string; cc: string; from: number; to: number | null; name?: string }
export interface Work { lat: number; lng: number; place_id: string; name?: string; from: number; to: number | null }
export interface Profile { name: string | null; units: 'km' | 'mi'; homes: Home[]; works: Work[] }

/** The home active at `ts`; homes sorted by `from`. Before the first window → first home. Past a
 *  home's `to` the next home takes over early (you were on your way); the last home never ends. */
/** Works whose window covers `ts`; `to` is exclusive, null never ends. */
export const worksAt = (works: Work[], ts: number): Work[] => works.filter((w) => w.from <= ts && (w.to === null || ts < w.to))

export function homeAt(homes: Home[], ts: number): Home {
  let cur = homes[0]
  homes.forEach((h, i) => { if (h.from <= ts) { cur = h; if (h.to !== null && ts >= h.to && i + 1 < homes.length) cur = homes[i + 1] } })
  return cur
}

const LS = 'elsewhere.profile'
/** Older profiles carried one undated `work`. */
export const migrate = (p: (Partial<Profile> & { work?: Omit<Work, 'from' | 'to'> | null }) | null): Profile | null =>
  p ? { name: p.name ?? null, units: p.units ?? 'km', homes: p.homes ?? [], works: p.works ?? (p.work ? [{ ...p.work, from: 0, to: null }] : []) } : null
const read = (): Profile | null => { try { return migrate(JSON.parse(localStorage.getItem(LS) ?? 'null')) } catch { return null } }
let cur: Profile | null = typeof localStorage === 'undefined' ? null : read()
const subs = new Set<() => void>()
export const profile = {
  get: () => cur,
  set: (p: Profile | null) => { cur = p; if (p) localStorage.setItem(LS, JSON.stringify(p)); else localStorage.removeItem(LS); subs.forEach((f) => f()) },
  subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f) } },
}
export const useProfile = () => useSyncExternalStore(profile.subscribe, profile.get)
