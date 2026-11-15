import { useSyncExternalStore } from 'react'
import { useSettings } from '../ingest/settings'

export type Provider = 'google' | 'osm'

/** Google flips to "down" for the page when its script reports a bad key, no billing, or a quota stop; `reason` is its error name. */
let reason: string | null = null
const subs = new Set<() => void>()
export const markGoogleDown = (why: unknown = 'AuthFailure') => { if (reason) return; reason = typeof why === 'string' ? why : 'AuthFailure'; subs.forEach((f) => f()) }
/** A corrected key deserves a fresh verdict from the Maps script. */
export const resetGoogleDown = () => { if (!reason) return; reason = null; subs.forEach((f) => f()) }
export const useGoogleDown = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => reason)

/** What Google's error names mean for the person holding the key. */
export const WHY: Record<string, string> = {
  BillingNotEnabledMapError: 'Billing is off on the Google Cloud project.',
  OverQuotaMapError: 'The key hit a daily quota or budget cap you set in Google Cloud.',
  RefererNotAllowedMapError: 'The key is restricted to other websites; add this address under Application restrictions.',
  InvalidKeyMapError: 'Google does not recognise this key.',
  ApiNotActivatedMapError: 'Maps JavaScript API is not enabled on the project.',
  ExpiredKeyMapError: 'The key has expired.',
  AuthFailure: 'Google rejected the key for map tiles.',
}

if (typeof window !== 'undefined') {
  (window as unknown as { gm_authFailure: () => void }).gm_authFailure = () => markGoogleDown()
  // The script only names the error on the console; read it off there so the page can say why.
  const err = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    const m = /Google Maps JavaScript API error: (\w+MapError)/.exec(args.map(String).join(' '))
    if (m) markGoogleDown(m[1])
    err(...args)
  }
}

/** Which map renders: the setting if forced, else Google when there is a working key and OpenStreetMap otherwise. */
export function useProvider(): Provider {
  const { mapsKey, mapProvider } = useSettings()
  const down = useGoogleDown()
  if (mapProvider !== 'auto') return mapProvider
  return mapsKey && !down ? 'google' : 'osm'
}
