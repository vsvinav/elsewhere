import { useSyncExternalStore } from 'react'
import { useSettings } from '../ingest/settings'

export type Provider = 'google' | 'osm'

/** Google flips to "down" for the page when its script reports a bad key, no billing, or a quota stop. */
let down = false
const subs = new Set<() => void>()
export const markGoogleDown = () => { if (down) return; down = true; subs.forEach((f) => f()) }
const useGoogleDown = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => down)
if (typeof window !== 'undefined') (window as unknown as { gm_authFailure: () => void }).gm_authFailure = markGoogleDown

/** Which map renders: the setting if forced, else Google when there is a working key and OpenStreetMap otherwise. */
export function useProvider(): Provider {
  const { mapsKey, mapProvider } = useSettings()
  const isDown = useGoogleDown()
  if (mapProvider !== 'auto') return mapProvider
  return mapsKey && !isDown ? 'google' : 'osm'
}
