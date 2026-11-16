// Keeps the recovery vault on the service current: whenever the profile or the settings subset changes and the
// passphrase key is in memory, the vault is sealed and uploaded two seconds later. Offline or keyless, it waits.
import { loadKeys, toHex, unb64, type DeviceKeys } from '../crew/keys'
import { settings, type Settings } from '../ingest/settings'
import { profile, type Profile } from '../profile/profile'
import { api, type AccountClient } from './client'
import { useAccount, type AccountState } from './store'
import { sealVault, type VaultPlain } from './vault'

export const SYNC_DEBOUNCE_MS = 2000

export interface SyncDeps { client?: () => AccountClient; now?: () => number; online?: () => boolean; keys?: () => Promise<DeviceKeys> }
const defaults: Required<SyncDeps> = { client: () => api(), now: Date.now, online: () => typeof navigator === 'undefined' || navigator.onLine !== false, keys: loadKeys }

export const vaultSettings = (s: Settings, prof: Profile) => ({ units: prof.units, relayUrl: s.relayUrl, accountUrl: s.accountUrl })
export const vaultPlain = (keys: DeviceKeys, prof: Profile, s: Settings): VaultPlain => ({ v: 1, signPriv: toHex(keys.signPriv), kxPriv: toHex(keys.kxPriv), profile: prof, settings: vaultSettings(s, prof) })

let lastPlain: string | null = null
/** After a restore the vault on the service already says this; the next change is what triggers an upload. */
export const markUploaded = (plain: VaultPlain | null) => { lastPlain = plain ? JSON.stringify(plain) : null }

/** Seals and uploads now if everything needed is at hand; marks the vault pending otherwise. True when it went up. */
export async function uploadVault(deps: SyncDeps = {}): Promise<boolean> {
  const d = { ...defaults, ...deps }
  const a = useAccount.getState()
  const prof = profile.get()
  if (!a.session || !prof) return false
  if (!a.key || !a.salt || !d.online()) { a.setPending(true); return false }
  try {
    const plain = vaultPlain(await d.keys(), prof, settings.get())
    const json = JSON.stringify(plain)
    if (json === lastPlain && a.vaultAt) { a.setPending(false); return true }
    await d.client().putVault(await sealVault(a.key, unb64(a.salt), plain))
    lastPlain = json
    useAccount.getState().setPending(false)
    await useAccount.getState().setVaultAt(d.now())
    return true
  } catch { useAccount.getState().setPending(true); return false }
}

/** Watches the profile, the settings subset and the account; returns a stop function. */
export function startVaultSync(deps: SyncDeps = {}): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { void uploadVault(deps) }, SYNC_DEBOUNCE_MS) }
  let lastSettings = JSON.stringify([settings.get().relayUrl, settings.get().accountUrl])
  const onSettings = () => { const k = JSON.stringify([settings.get().relayUrl, settings.get().accountUrl]); if (k !== lastSettings) { lastSettings = k; schedule() } }
  const onAccount = (s: AccountState, prev: AccountState) => { if ((s.key && !prev.key) || (s.session && !prev.session)) schedule() }
  const stops = [profile.subscribe(schedule), settings.subscribe(onSettings), useAccount.subscribe(onAccount)]
  // A change made while the last upload failed, or a vault never uploaded, goes up on start if the key is at hand.
  schedule()
  return () => { clearTimeout(timer); stops.forEach((f) => f()) }
}

export type VaultStatus = 'none' | 'fresh' | 'stale'
export const vaultStatus = (a: Pick<AccountState, 'session' | 'pending' | 'vaultAt'>, prof: Profile | null): VaultStatus =>
  !a.session ? 'none' : !a.pending && (a.vaultAt || !prof) ? 'fresh' : 'stale'
