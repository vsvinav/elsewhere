import { useSyncExternalStore } from 'react'
import { resetGoogleDown } from '../map/provider'

/** Keys the visitor types in; they never leave the browser. Env values are the deploy's defaults. */
export type MapProvider = 'auto' | 'google' | 'osm'
/** `keyOk` (Places) and `mapsOk` (Maps JavaScript) are null until the key has been checked; `limited` records that the visitor accepted free maps after a failed check. */
export interface Settings { mapsKey: string; mapId: string; mapProvider: MapProvider; keyOk: boolean | null; mapsOk: boolean | null; keyError: string; limited: boolean }
const LS = 'elsewhere.settings'
const ENV: Settings = { mapsKey: (import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined) ?? '', mapId: (import.meta.env.VITE_GOOGLE_MAP_ID as string | undefined) ?? '', mapProvider: 'auto', keyOk: null, mapsOk: null, keyError: '', limited: false }

const stored = (): Partial<Settings> => { try { return JSON.parse(localStorage.getItem(LS) ?? '{}') } catch { return {} } }
let cur: Settings = { ...ENV, ...stored() }
const subs = new Set<() => void>()
export const settings = {
  get: () => cur,
  set: (patch: Partial<Settings>) => { cur = { ...cur, ...patch }; localStorage.setItem(LS, JSON.stringify(cur)); subs.forEach((f) => f()) },
  /** A different key starts unchecked and un-accepted. */
  setKey: (mapsKey: string) => { if (mapsKey !== cur.mapsKey) { resetGoogleDown(); settings.set({ mapsKey, keyOk: null, mapsOk: null, keyError: '', limited: false }) } },
  subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f) } },
}
export const useSettings = () => useSyncExternalStore(settings.subscribe, settings.get)
