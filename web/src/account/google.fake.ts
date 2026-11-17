// A stand-in for the Google Identity Services library, for tests: remembers the init, draws a button and hands back whatever credential the test chooses.
import type { GoogleIdentity, TokenResponse } from './google'

type Init = Parameters<GoogleIdentity['accounts']['id']['initialize']>[0]
type TokenInit = Parameters<GoogleIdentity['accounts']['oauth2']['initTokenClient']>[0]
export function fakeGis() {
  const state = { init: null as Init | null, host: null as HTMLElement | null, clicks: 0, prompts: 0, token: null as TokenInit | null, tokenRequests: 0 }
  const gis = {
    accounts: {
      id: {
        initialize: (c: Init) => { state.init = c },
        renderButton: (host: HTMLElement) => {
          // The real library logs a warning and draws nothing until initialize() has run.
          if (!state.init) return
          host.innerHTML = ''
          const b = document.createElement('div'); b.setAttribute('role', 'button'); b.textContent = 'Sign in with Google'
          b.addEventListener('click', () => { state.clicks++ })
          host.appendChild(b); state.host = host
        },
        prompt: () => { state.prompts++ },
      },
      oauth2: {
        initTokenClient: (c: TokenInit) => { state.token = c; return { requestAccessToken: () => { state.tokenRequests++ } } },
      },
    },
  } as unknown as GoogleIdentity
  return {
    gis,
    get init() { return state.init! }, get host() { return state.host }, get clicks() { return state.clicks }, get prompts() { return state.prompts },
    credential: (c: string) => state.init!.callback({ credential: c }),
    get tokenScope() { return state.token?.scope }, get tokenRequests() { return state.tokenRequests },
    token: (r: TokenResponse) => state.token!.callback(r),
    tokenError: () => state.token!.error_callback?.({ type: 'popup_closed' }),
  }
}
