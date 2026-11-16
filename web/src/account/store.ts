// What this device remembers about its account: the session, the vault salt, when the vault last went up, and whether
// the visitor has been past the welcome screen. The passphrase-derived key lives in memory only.
import { create } from 'zustand'
import { kv } from '../ingest/db'

export interface SessionRec { session: string; id: string; email: string }
export const ACCOUNT_KV = { session: 'account:session', salt: 'account:salt', vaultAt: 'account:vaultAt', vaultHash: 'account:vaultHash', welcomed: 'welcomed' } as const

export interface AccountState {
  loaded: boolean
  session: SessionRec | null
  /** base64, 16 bytes; set when a passphrase is chosen or a vault is opened. */
  salt: string | null
  /** When the vault last reached the service. */
  vaultAt: number | null
  /** sha256 hex of the plaintext last uploaded or restored; a reload compares against it instead of asking for the passphrase. */
  vaultHash: string | null
  welcomed: boolean
  /** Passphrase-derived vault key, this page load only. */
  key: Uint8Array | null
  /** Something changed since the last upload and has not gone up yet. */
  pending: boolean
  load(): Promise<void>
  setSession(s: SessionRec | null): Promise<void>
  setSalt(salt: string | null): Promise<void>
  setVaultAt(t: number | null): Promise<void>
  setVaultHash(h: string | null): Promise<void>
  setWelcomed(v: boolean): Promise<void>
  setKey(k: Uint8Array | null): void
  setPending(v: boolean): void
  /** Forget the session, salt and key on this device; the record and the identity stay. */
  signOut(): Promise<void>
}

const put = (k: string, v: unknown) => (v === null || v === undefined ? kv.del(k) : kv.set(k, v))
const isSession = (s: unknown): s is SessionRec => !!s && typeof (s as SessionRec).session === 'string' && typeof (s as SessionRec).id === 'string' && typeof (s as SessionRec).email === 'string'

export const useAccount = create<AccountState>((set) => ({
  loaded: false, session: null, salt: null, vaultAt: null, vaultHash: null, welcomed: false, key: null, pending: false,
  load: async () => {
    const [session, salt, vaultAt, vaultHash, welcomed] = await Promise.all([kv.get<unknown>(ACCOUNT_KV.session), kv.get<unknown>(ACCOUNT_KV.salt), kv.get<unknown>(ACCOUNT_KV.vaultAt), kv.get<unknown>(ACCOUNT_KV.vaultHash), kv.get<unknown>(ACCOUNT_KV.welcomed)])
    set({ loaded: true, session: isSession(session) ? session : null, salt: typeof salt === 'string' ? salt : null, vaultAt: typeof vaultAt === 'number' ? vaultAt : null, vaultHash: typeof vaultHash === 'string' ? vaultHash : null, welcomed: welcomed === true })
  },
  setSession: async (session) => { set({ session }); await put(ACCOUNT_KV.session, session) },
  setSalt: async (salt) => { set({ salt }); await put(ACCOUNT_KV.salt, salt) },
  setVaultAt: async (vaultAt) => { set({ vaultAt }); await put(ACCOUNT_KV.vaultAt, vaultAt) },
  setVaultHash: async (vaultHash) => { set({ vaultHash }); await put(ACCOUNT_KV.vaultHash, vaultHash) },
  setWelcomed: async (welcomed) => { set({ welcomed }); await put(ACCOUNT_KV.welcomed, welcomed) },
  setKey: (key) => set({ key }),
  setPending: (pending) => set({ pending }),
  signOut: async () => {
    set({ session: null, salt: null, vaultAt: null, vaultHash: null, key: null, pending: false })
    await Promise.all([kv.del(ACCOUNT_KV.session), kv.del(ACCOUNT_KV.salt), kv.del(ACCOUNT_KV.vaultAt), kv.del(ACCOUNT_KV.vaultHash)])
  },
}))

/** Tests put the store back to a fresh device. */
export const resetAccountForTest = () => useAccount.setState({ loaded: false, session: null, salt: null, vaultAt: null, vaultHash: null, welcomed: false, key: null, pending: false })
