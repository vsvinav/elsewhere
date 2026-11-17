// Keeps the recovery vault on the service current: whenever the profile or the settings subset changes and the key is at
// hand (passphrase key in memory, or the Drive key on disk), the vault is sealed and uploaded two seconds later. Offline
// or keyless, it waits.
import { sha256 } from '@noble/hashes/sha2.js'
import { utf8ToBytes } from '@noble/hashes/utils.js'
import { loadKeys, toHex, unb64, type DeviceKeys } from '../crew/keys'
import { settings, type Settings } from '../ingest/settings'
import { profile, type Profile } from '../profile/profile'
import { api, type AccountClient } from './client'
import { useAccount, type AccountState } from './store'
import { loadLocalKey } from './driveKey'
import { sealVault, sealVaultWithDriveKey, type VaultBody, type VaultPlain } from './vault'

export const SYNC_DEBOUNCE_MS = 2000

export interface SyncDeps { client?: () => AccountClient; now?: () => number; online?: () => boolean; keys?: () => Promise<DeviceKeys> }
const defaults: Required<SyncDeps> = { client: () => api(), now: Date.now, online: () => typeof navigator === 'undefined' || navigator.onLine !== false, keys: loadKeys }

export const vaultSettings = (s: Settings, prof: Profile) => ({ units: prof.units, relayUrl: s.relayUrl, accountUrl: s.accountUrl })
export const vaultPlain = (keys: DeviceKeys, prof: Profile, s: Settings): VaultPlain => ({ v: 1, signPriv: toHex(keys.signPriv), kxPriv: toHex(keys.kxPriv), profile: prof, settings: vaultSettings(s, prof) })

/** What the service holds is identified by the hash of its plaintext; the same hash on both sides means nothing to send. */
export const vaultHashOf = (plain: VaultPlain) => toHex(sha256(utf8ToBytes(JSON.stringify(plain))))
/** After a restore the vault on the service already says this; the next change is what triggers an upload. */
export const markUploaded = (plain: VaultPlain | null) => useAccount.getState().setVaultHash(plain ? vaultHashOf(plain) : null)

/** Seals and uploads now if the vault is behind and everything needed is at hand; marks it pending otherwise. True when current. */
export async function uploadVault(deps: SyncDeps = {}): Promise<boolean> {
  const d = { ...defaults, ...deps }
  const a = useAccount.getState()
  const prof = profile.get()
  if (!a.session || !prof) return false
  try {
    const plain = vaultPlain(await d.keys(), prof, settings.get())
    const hash = vaultHashOf(plain)
    if (hash === a.vaultHash && a.vaultAt) { a.setPending(false); return true }
    const body = await sealFor(a, plain)
    if (!body || !d.online()) { a.setPending(true); return false }
    await d.client().putVault(body)
    useAccount.getState().setPending(false)
    await useAccount.getState().setVaultHash(hash)
    await useAccount.getState().setVaultAt(d.now())
    return true
  } catch { useAccount.getState().setPending(true); return false }
}

/** v:2 under the Drive key for a Google account, v:1 under the passphrase key otherwise; null when the key is not at hand. */
async function sealFor(a: AccountState, plain: VaultPlain): Promise<VaultBody | null> {
  if (a.driveKeyed) { const k = await loadLocalKey(); return k ? sealVaultWithDriveKey(k, plain) : null }
  return a.key && a.salt ? sealVault(a.key, unb64(a.salt), plain) : null
}

/** Watches the profile, the settings subset and the account; returns a stop function. */
export function startVaultSync(deps: SyncDeps = {}): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { void uploadVault(deps) }, SYNC_DEBOUNCE_MS) }
  let lastSettings = JSON.stringify([settings.get().relayUrl, settings.get().accountUrl])
  const onSettings = () => { const k = JSON.stringify([settings.get().relayUrl, settings.get().accountUrl]); if (k !== lastSettings) { lastSettings = k; schedule() } }
  const onAccount = (s: AccountState, prev: AccountState) => { if ((s.key && !prev.key) || (s.session && !prev.session) || (s.driveKeyed && !prev.driveKeyed)) schedule() }
  const stops = [profile.subscribe(schedule), settings.subscribe(onSettings), useAccount.subscribe(onAccount)]
  // A change made while the last upload failed, or a vault never uploaded, goes up on start if the key is at hand.
  schedule()
  return () => { clearTimeout(timer); stops.forEach((f) => f()) }
}

export type VaultStatus = 'none' | 'empty' | 'fresh' | 'stale'
export const vaultStatus = (a: Pick<AccountState, 'session' | 'pending' | 'vaultAt'>, prof: Profile | null): VaultStatus =>
  !a.session ? 'none' : !prof ? 'empty' : !a.pending && a.vaultAt ? 'fresh' : 'stale'
