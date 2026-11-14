import { useSyncExternalStore } from 'react'

/** Keys the visitor types in; they never leave the browser. Env values are the deploy's defaults. */
export interface Settings { mapsKey: string; mapId: string }
const LS = 'elsewhere.settings'
const ENV: Settings = { mapsKey: (import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined) ?? '', mapId: (import.meta.env.VITE_GOOGLE_MAP_ID as string | undefined) ?? '' }

const stored = (): Partial<Settings> => { try { return JSON.parse(localStorage.getItem(LS) ?? '{}') } catch { return {} } }
let cur: Settings = { ...ENV, ...stored() }
const subs = new Set<() => void>()
export const settings = {
  get: () => cur,
  set: (patch: Partial<Settings>) => { cur = { ...cur, ...patch }; localStorage.setItem(LS, JSON.stringify(cur)); subs.forEach((f) => f()) },
  subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f) } },
}
export const useSettings = () => useSyncExternalStore(settings.subscribe, settings.get)
