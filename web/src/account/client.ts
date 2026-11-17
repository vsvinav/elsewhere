// Plain HTTPS calls to the account service. A 401 on an authenticated call means the session is gone; the device forgets it.
import { settings } from '../ingest/settings'
import { useAccount } from './store'
import type { VaultBody } from './vault'

export interface AccountInfo { id: string; email: string; created: number; hasVault: boolean }
export interface Finish { session: string; account: AccountInfo }
export type FinishBody = { email: string; code: string } | { token: string }

export class AccountError extends Error {
  constructor(public status: number, public code: string) { super(code); this.name = 'AccountError' }
}
/** Service error codes as the screens say them; anything else falls back to the generic line. */
export const MESSAGES: Record<string, string> = {
  'slow down': 'Too many tries. Give it an hour.',
  'wrong code': "That code isn't right.",
  'expired': 'That code expired. Send a new one.',
}
export const NETWORK_MESSAGE = "Couldn't reach the account service. Check your connection."
export const GENERIC_MESSAGE = 'Something went wrong. Try again.'
export const messageOf = (e: unknown): string => (e instanceof AccountError ? MESSAGES[e.code] ?? (e.status === 0 ? NETWORK_MESSAGE : GENERIC_MESSAGE) : NETWORK_MESSAGE)

export interface AccountClient {
  start(email: string): Promise<{ dev?: { code: string } }>
  finish(body: FinishBody): Promise<Finish>
  /** A Google ID token in place of the mailed code. */
  google(idToken: string): Promise<Finish>
  /** The address behind a mail-link token, so the person holding the link can confirm it is theirs. */
  peek(token: string): Promise<{ email: string }>
  me(): Promise<AccountInfo>
  logout(): Promise<void>
  putVault(body: VaultBody): Promise<void>
  getVault(): Promise<VaultBody | null>
  deleteMe(): Promise<void>
}
export interface ClientOpts { fetchFn?: typeof fetch; session?: () => string | null; onUnauthorized?: () => void }

export function accountClient(base: string, opts: ClientOpts = {}): AccountClient {
  const root = base.replace(/\/+$/, '')
  const fetchFn = opts.fetchFn ?? fetch
  const call = async (method: string, path: string, body?: unknown, auth = false): Promise<Response> => {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (auth) {
      const s = opts.session?.() ?? null
      if (!s) throw new AccountError(401, 'unauthorized')
      headers.Authorization = `Bearer ${s}`
    }
    let res: Response
    try { res = await fetchFn(root + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }) }
    catch { throw new AccountError(0, 'network') }
    if (res.ok) return res
    if (auth && res.status === 401) opts.onUnauthorized?.()
    const code = await res.json().then((j: { error?: unknown }) => (typeof j?.error === 'string' ? j.error : ''), () => '')
    throw new AccountError(res.status, code || res.statusText || `http ${res.status}`)
  }
  return {
    start: async (email) => (await call('POST', '/auth/start', { email })).json(),
    finish: async (body) => (await call('POST', '/auth/finish', body)).json(),
    google: async (idToken) => (await call('POST', '/auth/google', { idToken })).json(),
    peek: async (token) => (await call('GET', `/auth/peek?token=${encodeURIComponent(token)}`)).json(),
    me: async () => (await call('GET', '/me', undefined, true)).json(),
    logout: async () => { await call('DELETE', '/session', undefined, true) },
    putVault: async (body) => { await call('PUT', '/vault', body, true) },
    getVault: async () => {
      try { return await (await call('GET', '/vault', undefined, true)).json() }
      catch (e) { if (e instanceof AccountError && e.status === 404) return null; throw e }
    },
    deleteMe: async () => { await call('DELETE', '/me', undefined, true) },
  }
}

/** The client for the configured service, bound to this device's session. */
export const api = (fetchFn?: typeof fetch) => accountClient(settings.get().accountUrl, {
  fetchFn,
  session: () => useAccount.getState().session?.session ?? null,
  onUnauthorized: () => { void useAccount.getState().signOut() },
})

/** Log out: tell the service, then forget the session here. The record and identity stay on the device. */
export async function logOut(c: AccountClient = api()): Promise<void> {
  try { await c.logout() } catch { /* the session may already be gone; forgetting it locally is what matters */ }
  await useAccount.getState().signOut()
}
/** Delete the account on the service, then log out locally. */
export async function deleteAccount(c: AccountClient = api()): Promise<void> {
  await c.deleteMe()
  await useAccount.getState().signOut()
}
