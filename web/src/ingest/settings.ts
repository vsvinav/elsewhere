import { useSyncExternalStore } from 'react'
import { resetGoogleDown } from '../map/provider'
import type { LlmConfig } from '../ask/llm'

/** Keys the visitor types in; they never leave the browser. Env values are the deploy's defaults. */
export type MapProvider = 'auto' | 'google' | 'osm'
/** `keyOk` (Places) and `mapsOk` (Maps JavaScript) are null until the key has been checked; `limited` records that the visitor accepted free maps after a failed check. */
/** `llm` is the visitor's own model provider for Ask Elsewhere; like the Maps key it is sent straight from the browser. */
/** `relayUrl` is the Crew relay this browser pairs and listens through; empty turns Crew off. `accountUrl` is the account service that keeps the recovery vault. */
export interface Settings { mapsKey: string; mapId: string; mapProvider: MapProvider; keyOk: boolean | null; mapsOk: boolean | null; keyError: string; limited: boolean; llm: LlmConfig; relayUrl: string; accountUrl: string }
const LS = 'elsewhere.settings'
export const DEFAULT_LLM: LlmConfig = { provider: 'openai', key: '', model: '', baseUrl: '' }
export const DEFAULT_RELAY = 'https://relay.elsewhere.app'
export const DEFAULT_ACCOUNT = 'https://account.elsewhere.app'
const ENV: Settings = { mapsKey: (import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined) ?? '', mapId: (import.meta.env.VITE_GOOGLE_MAP_ID as string | undefined) ?? '', mapProvider: 'auto', keyOk: null, mapsOk: null, keyError: '', limited: false, llm: DEFAULT_LLM, relayUrl: DEFAULT_RELAY, accountUrl: DEFAULT_ACCOUNT }

const stored = (): Partial<Settings> => { try { return JSON.parse(localStorage.getItem(LS) ?? '{}') } catch { return {} } }
// Older blobs lack `llm` or carry only part of it.
const migrate = (p: Partial<Settings>): Settings => ({ ...ENV, ...p, llm: { ...DEFAULT_LLM, ...(p.llm ?? {}) } })
let cur: Settings = migrate(stored())
const subs = new Set<() => void>()
export const settings = {
  get: () => cur,
  set: (patch: Partial<Settings>) => { cur = { ...cur, ...patch }; localStorage.setItem(LS, JSON.stringify(cur)); subs.forEach((f) => f()) },
  /** A different key starts unchecked and un-accepted. */
  setKey: (mapsKey: string) => { if (mapsKey !== cur.mapsKey) { resetGoogleDown(); settings.set({ mapsKey, keyOk: null, mapsOk: null, keyError: '', limited: false }) } },
  subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f) } },
}
export const useSettings = () => useSyncExternalStore(settings.subscribe, settings.get)
