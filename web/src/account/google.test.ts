// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeGis } from './google.fake'
import { GSI_SRC, resetGoogleForTest, signIn, warm, type GoogleIdentity } from './google'

const tick = () => new Promise((r) => setTimeout(r, 0))
afterEach(() => { resetGoogleForTest(); delete (window as { google?: unknown }).google; document.head.innerHTML = ''; document.body.innerHTML = ''; vi.unstubAllEnvs() })

describe('google sign-in', () => {
  it('injects the GIS script once, renders Google\'s button offscreen, clicks it, and resolves with the credential', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'web.apps.googleusercontent.com')
    const g = fakeGis()
    const p = signIn()
    const script = document.head.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`)!
    expect(script).toBeTruthy()
    ;(window as { google?: GoogleIdentity }).google = g.gis
    script.dispatchEvent(new Event('load'))
    await tick()
    expect(g.init.client_id).toBe('web.apps.googleusercontent.com')
    expect(g.clicks).toBe(1)
    expect(g.prompts).toBe(0)
    // Google's own button lives off screen; ours is the one the eye sees.
    const host = g.host!
    expect(document.body.contains(host)).toBe(true)
    expect(host.getAttribute('aria-hidden')).toBe('true')
    g.credential('id.token.here')
    expect(await p).toEqual({ idToken: 'id.token.here' })
    const p2 = signIn()
    await tick()
    expect(document.head.querySelectorAll('script').length).toBe(1)
    expect(document.querySelectorAll('[aria-hidden] div[role=button]').length).toBe(1)
    expect(g.clicks).toBe(2)
    g.credential('second')
    expect(await p2).toEqual({ idToken: 'second' })
  })
  it('warms up before any tap and the later tap still reaches Google\'s button', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'web.apps.googleusercontent.com')
    const g = fakeGis()
    ;(window as { google?: GoogleIdentity }).google = g.gis
    warm()
    await tick()
    expect(document.querySelectorAll('[aria-hidden] div[role=button]').length).toBe(1)
    const p = signIn()
    await tick()
    expect(g.clicks).toBe(1)
    g.credential('warmed')
    expect(await p).toEqual({ idToken: 'warmed' })
  })
  it('rejects when the script fails to load or Google never calls back with a credential', async () => {
    const failing = signIn()
    document.head.querySelector('script')!.dispatchEvent(new Event('error'))
    await expect(failing).rejects.toThrow()
    const g = fakeGis()
    ;(window as { google?: GoogleIdentity }).google = g.gis
    const p = signIn()
    await tick()
    g.credential('')
    await expect(p).rejects.toThrow()
  })
})
