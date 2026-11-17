// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GSI_SRC, signIn, type GoogleIdentity } from './google'

type Init = { client_id: string; callback(r: { credential: string }): void }
type Moment = { isNotDisplayed(): boolean; isSkippedMoment(): boolean; isDismissedMoment(): boolean; getDismissedReason(): string }
const tick = () => new Promise((r) => setTimeout(r, 0))
const moment = (over: Partial<Moment> = {}): Moment => ({ isNotDisplayed: () => false, isSkippedMoment: () => false, isDismissedMoment: () => false, getDismissedReason: () => '', ...over })

/** A stand-in for the GIS library: remembers the init and lets the test play the prompt's outcome. */
function fakeGis() {
  let init: Init | null = null
  let onMoment: ((m: Moment) => void) | null = null
  const gis = { accounts: { id: { initialize: (c: Init) => { init = c }, prompt: (cb: (m: Moment) => void) => { onMoment = cb } } } } as unknown as GoogleIdentity
  return { gis, get init() { return init! }, play: (m: Moment) => onMoment!(m) }
}
afterEach(() => { delete (window as { google?: unknown }).google; document.head.innerHTML = ''; vi.unstubAllEnvs() })

describe('google sign-in', () => {
  it('injects the GIS script once, then resolves with the credential the prompt hands back', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'web.apps.googleusercontent.com')
    const g = fakeGis()
    const p = signIn()
    const script = document.head.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`)!
    expect(script).toBeTruthy()
    ;(window as { google?: GoogleIdentity }).google = g.gis
    script.dispatchEvent(new Event('load'))
    await tick()
    expect(g.init.client_id).toBe('web.apps.googleusercontent.com')
    g.init.callback({ credential: 'id.token.here' })
    expect(await p).toEqual({ idToken: 'id.token.here' })
    // The library is already here: no second script.
    const p2 = signIn()
    await tick()
    expect(document.head.querySelectorAll('script').length).toBe(1)
    g.init.callback({ credential: 'second' })
    expect(await p2).toEqual({ idToken: 'second' })
  })
  it('rejects when the prompt is skipped, dismissed or never shown, and when the script fails to load', async () => {
    const g = fakeGis()
    ;(window as { google?: GoogleIdentity }).google = g.gis
    for (const m of [moment({ isNotDisplayed: () => true }), moment({ isSkippedMoment: () => true }), moment({ isDismissedMoment: () => true, getDismissedReason: () => 'cancel_called' })]) {
      const p = signIn()
      await tick()
      g.play(m)
      await expect(p).rejects.toThrow()
    }
    // A dismissal because the credential came back is not a failure; the callback settles it.
    const p = signIn()
    await tick()
    g.play(moment({ isDismissedMoment: () => true, getDismissedReason: () => 'credential_returned' }))
    g.init.callback({ credential: 'ok' })
    expect(await p).toEqual({ idToken: 'ok' })

    delete (window as { google?: unknown }).google
    const failing = signIn()
    document.head.querySelector('script')!.dispatchEvent(new Event('error'))
    await expect(failing).rejects.toThrow()
  })
})
