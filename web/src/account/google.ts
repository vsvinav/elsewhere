// Google Identity Services, loaded from Google the first time it is wanted. Nothing here runs unless a client ID is built in.
export const GSI_SRC = 'https://accounts.google.com/gsi/client'
export const clientId = () => (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? ''
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'

export interface GoogleIdentity {
  accounts: {
    id: {
      initialize(c: { client_id: string; callback(r: { credential: string }): void; ux_mode?: 'popup' | 'redirect' }): void
      renderButton(host: HTMLElement, opts: { type: 'standard' | 'icon'; size?: 'large' | 'medium' | 'small' }): void
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

/** Google's own button, drawn off screen: the only thing that opens Google's sign-in popup is a click on it. */
let hidden: HTMLElement | null = null
let pending: ((r: { credential?: string }) => void) | null = null
let initialised = false
function googleButton(g: GoogleIdentity): HTMLElement | null {
  if (!initialised) {
    // One initialize for the page; GIS refuses to draw the button before it, and the callback fans out to whoever asked.
    g.accounts.id.initialize({ client_id: clientId(), ux_mode: 'popup', callback: (r) => pending?.(r) })
    initialised = true
  }
  if (!hidden || !document.body.contains(hidden)) {
    hidden = document.createElement('div')
    hidden.setAttribute('aria-hidden', 'true')
    hidden.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none'
    document.body.appendChild(hidden)
  }
  if (!hidden.querySelector('div[role=button]')) g.accounts.id.renderButton(hidden, { type: 'standard', size: 'large' })
  return hidden.querySelector<HTMLElement>('div[role=button]')
}

export function resetGoogleForTest(): void { hidden = null; pending = null; initialised = false; loading = null }

/** Fetches the script and draws the hidden button ahead of the tap, so the forwarded click still counts as a gesture. */
export function warm(): void {
  load().then(googleButton).catch(() => {})
}

/** Asks Google who this is; resolves with an ID token for the account service, rejects when no credential comes back. */
export async function signIn(): Promise<{ idToken: string }> {
  const g = await load()
  return new Promise((resolve, reject) => {
    pending = (r) => { pending = null; r.credential ? resolve({ idToken: r.credential }) : reject(new Error('google')) }
    const b = googleButton(g)
    if (!b) { pending = null; return reject(new Error('google')) }
    b.click()
  })
}

/** An access token for the hidden Drive app folder; the key to the synced record will travel through it. */
export async function driveToken(): Promise<string> {
  await load()
  throw new Error(`not yet: ${DRIVE_SCOPE}`)
}
