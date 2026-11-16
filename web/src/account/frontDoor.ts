import type { AccountState } from './store'

export type Door = 'loading' | 'auth' | 'welcome' | 'through'

/**
 * Which screen stands in front of the app. The stored account must be read before an auth flow may run: a mail-link
 * sign-in that finished first would be wiped when `load()` wrote the old (empty) session over it.
 */
export function frontDoor(a: Pick<AccountState, 'loaded' | 'session' | 'welcomed'>, auth: boolean, hasProfile: boolean): Door {
  if (!a.loaded) return 'loading'
  if (auth) return 'auth'
  if (!hasProfile && !a.session && !a.welcomed) return 'welcome'
  return 'through'
}
