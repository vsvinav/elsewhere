// What the Sync section shows: off, idle since a time, syncing, or an error of a kind.
import { create } from 'zustand'

export type SyncErrorKind = 'locked' | 'network' | 'http'
export type SyncStatus = { kind: 'off' } | { kind: 'idle'; lastTs: number | null } | { kind: 'syncing' } | { kind: 'error'; error: SyncErrorKind; lastTs: number | null }

export interface SyncState {
  status: SyncStatus
  /** Bumped when a pull changed the stays on this device; the record is derived again on it. */
  staysVersion: number
  setStatus(s: SyncStatus): void
  bumpStays(): void
}
export const useSync = create<SyncState>((set) => ({
  status: { kind: 'off' },
  staysVersion: 0,
  setStatus: (status) => set({ status }),
  bumpStays: () => set((s) => ({ staysVersion: s.staysVersion + 1 })),
}))
export const resetSyncForTest = () => useSync.setState({ status: { kind: 'off' }, staysVersion: 0 })
