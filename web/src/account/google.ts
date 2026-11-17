// Google Identity Services, loaded from Google the first time it is wanted. Nothing here runs unless a client ID is built in.
export const GSI_SRC = 'https://accounts.google.com/gsi/client'
export const clientId = () => (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? ''
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'

interface Moment { isNotDisplayed(): boolean; isSkippedMoment(): boolean; isDismissedMoment(): boolean; getDismissedReason(): string }
export interface GoogleIdentity {
  accounts: {
    id: {
      initialize(c: { client_id: string; callback(r: { credential: string }): void; cancel_on_tap_outside?: boolean; use_fedcm_for_prompt?: boolean }): void
      prompt(onMoment?: (m: Moment) => void): void
    }
  }
}
declare global { interface Window { google?: GoogleIdentity } }

let loading: Promise<GoogleIdentity> | null = null
function load(): Promise<GoogleIdentity> {
  if (window.google?.accounts) return Promise.resolve(window.google)
  if (loading) return loading
  const p = new Promise<GoogleIdentity>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = GSI_SRC; s.async = true
    s.onload = () => (window.google?.accounts ? resolve(window.google) : reject(new Error('gis')))
    s.onerror = () => { s.remove(); reject(new Error('gis')) }
    document.head.appendChild(s)
  }).finally(() => { loading = null })
  loading = p
  return p
}

/** Asks Google who this is; resolves with an ID token for the account service, rejects when the prompt closes without one. */
export async function signIn(): Promise<{ idToken: string }> {
  const g = await load()
  return new Promise((resolve, reject) => {
    g.accounts.id.initialize({ client_id: clientId(), callback: (r) => resolve({ idToken: r.credential }), cancel_on_tap_outside: true, use_fedcm_for_prompt: true })
    g.accounts.id.prompt((m) => {
      if (m.isNotDisplayed() || m.isSkippedMoment() || (m.isDismissedMoment() && m.getDismissedReason() !== 'credential_returned')) reject(new Error('google'))
    })
  })
}

/** An access token for the hidden Drive app folder; the key to the synced record will travel through it. */
export async function driveToken(): Promise<string> {
  await load()
  throw new Error(`not yet: ${DRIVE_SCOPE}`)
}
