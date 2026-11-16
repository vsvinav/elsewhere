// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const db = vi.hoisted(() => ({ store: new Map<string, unknown>() }))
vi.mock('../ingest/db', () => ({ kv: { get: async (k: string) => db.store.get(k), set: async (k: string, v: unknown) => { db.store.set(k, v) }, del: async (k: string) => { db.store.delete(k) } } }))
vi.hoisted(() => {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) })
})

import { sha256 } from '@noble/hashes/sha2.js'
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import { fromHex, loadKeys, setKeysForTest, toHex, unb64 } from '../crew/keys'
import { settings } from '../ingest/settings'
import { profile, type Profile } from '../profile/profile'
import { AuthFlow, COPY, takeAuthToken } from './AuthFlow'
import { AccountError, type AccountClient, type AccountInfo } from './client'
import { resetAccountForTest, useAccount } from './store'
import { encryptVault, type VaultBody, type VaultPlain } from './vault'

// A fast stand-in for PBKDF2 so the screens can be driven without a second of hashing per step.
const derive = async (p: string, salt: Uint8Array) => sha256(concatBytes(utf8ToBytes(p.trim()), salt))
const ADA: Profile = { name: 'Ada', units: 'km', homes: [{ lat: 51.5, lng: -0.12, city: 'London', cc: 'GB', from: 0, to: null }], works: [] }
const SIGN = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', KX = '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a'

function fakeService(hasVault = false, vault: VaultBody | null = null) {
  const account: AccountInfo = { id: 'acct_1', email: 'ada@example.com', created: 1, hasVault }
  const calls: string[] = []
  let startFails: AccountError | null = null
  const client: AccountClient = {
    start: async (email) => { calls.push(`start ${email}`); if (startFails) throw startFails; return { dev: { code: '123456' } } },
    finish: async (body) => { calls.push(`finish ${JSON.stringify(body)}`); if ('token' in body ? body.token !== 't' : body.code !== '123456') throw new AccountError('token' in body ? 400 : 401, 'token' in body ? 'expired' : 'wrong code'); return { session: 'sess', account } },
    peek: async (token) => { calls.push(`peek ${token}`); if (token !== 't') throw new AccountError(400, 'expired'); return { email: 'a***@example.com' } },
    me: async () => account,
    logout: async () => { calls.push('logout') },
    putVault: async () => {},
    getVault: async () => vault,
    deleteMe: async () => {},
  }
  return { client, calls, failStart: (e: AccountError | null) => { startFails = e } }
}
const mount = (props: Partial<Parameters<typeof AuthFlow>[0]> & { client: AccountClient }) => {
  const host = document.body.appendChild(document.createElement('div'))
  const onDone = vi.fn()
  act(() => createRoot(host).render(createElement(AuthFlow, { mode: 'signup', onDone, derive, ...props })))
  return { host, onDone }
}
const settle = () => act(() => new Promise((r) => setTimeout(r, 5)))
const type = (el: HTMLInputElement, value: string) => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })) })
const submit = (host: HTMLElement) => act(() => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
const text = (host: HTMLElement, sel: string) => host.querySelector(sel)?.textContent ?? null
const digit = (host: HTMLElement, i: number) => host.querySelector<HTMLInputElement>(`[aria-label="Digit ${i}"]`)!

beforeEach(() => { db.store.clear(); resetAccountForTest(); profile.set(null); setKeysForTest(undefined); document.body.innerHTML = ''; settings.set({ relayUrl: 'https://relay.elsewhere.app' }) })

describe('AuthFlow', () => {
  it('email → code → set a passphrase for a new account, then hands back with the key in memory', async () => {
    const svc = fakeService(false)
    const { host, onDone } = mount({ client: svc.client })
    expect(text(host, '.ob-title')).toBe(COPY.email)
    expect(text(host, '.ob-head .caps')).toBe('Sign up')
    const email = host.querySelector<HTMLInputElement>('#acct-email')!
    type(email, ' Ada@Example.com ')
    submit(host); await settle()
    expect(svc.calls).toEqual(['start Ada@Example.com'])
    expect(text(host, '.ob-title')).toBe(COPY.codeTitle)
    expect(text(host, '.lede')).toBe('We sent a code to Ada@Example.com')
    expect(host.textContent).toContain(COPY.linkToo)
    // Typing moves along; the sixth digit submits.
    type(digit(host, 1), '1'); type(digit(host, 2), '2'); type(digit(host, 3), '3')
    expect(document.activeElement).toBe(digit(host, 4))
    type(digit(host, 4), '4'); type(digit(host, 5), '5'); type(digit(host, 6), '6')
    await settle()
    expect(svc.calls[1]).toBe('finish {"email":"Ada@Example.com","code":"123456"}')
    expect(useAccount.getState().session).toEqual({ session: 'sess', id: 'acct_1', email: 'ada@example.com' })
    expect(text(host, '.ob-title')).toBe(COPY.setTitle)
    expect(host.textContent).toContain("Only you know this. We can't reset it.")
    const p = host.querySelector<HTMLInputElement>('#acct-pass')!, q = host.querySelector<HTMLInputElement>('#acct-pass2')!
    type(p, 'elevenchars'); type(q, 'elevenchars'); submit(host); await settle()
    expect(text(host, '[role=alert]')).toBe('At least 12 characters.')
    type(p, 'password1234'); type(q, 'password1234'); submit(host); await settle()
    expect(text(host, '[role=alert]')).toBe("That one's too easy to guess.")
    expect(onDone).not.toHaveBeenCalled()
    type(p, 'correct horse'); type(q, 'correct horsf'); submit(host); await settle()
    expect(text(host, '[role=alert]')).toBe(COPY.mismatch)
    type(q, 'correct horse'); submit(host); await settle()
    expect(onDone).toHaveBeenCalledWith({ restored: false })
    const a = useAccount.getState()
    expect(a.key).toHaveLength(32)
    expect(unb64(a.salt!)).toHaveLength(16)
    expect(toHex(a.key!)).toBe(toHex(await derive('correct horse', unb64(a.salt!))))
    expect(db.store.get('account:salt')).toBe(a.salt)
  })
  it('a pasted code fills every box; a wrong code says so and a resend respects the rate limit', async () => {
    const svc = fakeService(false)
    const { host } = mount({ client: svc.client, mode: 'login' })
    expect(text(host, '.ob-head .caps')).toBe('Log in')
    type(host.querySelector<HTMLInputElement>('#acct-email')!, 'ada@example.com'); submit(host); await settle()
    const paste = (el: HTMLInputElement, s: string) => act(() => { const e = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown }; e.clipboardData = { getData: () => s }; el.dispatchEvent(e) })
    paste(digit(host, 1), '000 000'); await settle()
    expect([1, 2, 3, 4, 5, 6].map((i) => digit(host, i).value).join('')).toBe('000000')
    expect(text(host, '[role=alert]')).toBe("That code isn't right.")
    svc.failStart(new AccountError(429, 'slow down'))
    await act(() => { [...host.querySelectorAll('button')].find((b) => b.textContent === COPY.resend)!.click() }); await settle()
    expect(text(host, '[role=alert]')).toBe('Too many tries. Give it an hour.')
    svc.failStart(null)
    await act(() => { [...host.querySelectorAll('button')].find((b) => b.textContent === COPY.resend)!.click() }); await settle()
    expect(text(host, '[role=status]')).toBe(COPY.resent)
    expect(svc.calls.filter((c) => c.startsWith('start'))).toHaveLength(3)
  })
  it('a network failure on start is shown under the email field', async () => {
    const svc = fakeService(false)
    svc.failStart(new AccountError(0, 'network'))
    const { host } = mount({ client: svc.client })
    type(host.querySelector<HTMLInputElement>('#acct-email')!, 'ada@example.com'); submit(host); await settle()
    expect(text(host, '.ob-title')).toBe(COPY.email)
    expect(text(host, '[role=alert]')).toBe("Couldn't reach the account service. Check your connection.")
  })
  it('a mail-link token first asks "Log in as a***@example.com?"; Continue signs in without a code', async () => {
    const svc = fakeService(false)
    // Leftovers from an earlier vault on this device go with the new session.
    await useAccount.getState().setSalt('b2xk'); await useAccount.getState().setVaultAt(5); await useAccount.getState().setVaultHash('h'); useAccount.getState().setKey(new Uint8Array(32))
    const { host } = mount({ client: svc.client, token: 't' })
    await settle()
    expect(svc.calls).toEqual(['peek t'])
    expect(text(host, '.ob-title')).toBe('Log in as a***@example.com?')
    act(() => [...host.querySelectorAll('button')].find((b) => b.textContent === COPY.linkYes)!.click())
    await settle()
    expect(svc.calls).toEqual(['peek t', 'finish {"token":"t"}'])
    expect(text(host, '.ob-title')).toBe(COPY.setTitle)
    const a = useAccount.getState()
    expect([a.salt, a.vaultAt, a.vaultHash, a.key]).toEqual([null, null, null, null])
    expect(db.store.has('account:salt')).toBe(false)
  })
  it('a link while another account is signed in asks to switch, and signs the old one out first', async () => {
    const svc = fakeService(false)
    await useAccount.getState().setSession({ session: 'old', id: 'acct_0', email: 'bo@example.com' })
    const { host } = mount({ client: svc.client, token: 't', current: 'bo@example.com' })
    await settle()
    expect(text(host, '.ob-title')).toBe('Switch to a***@example.com?')
    expect(host.textContent).toContain('You are signed in as bo@example.com on this device.')
    act(() => [...host.querySelectorAll('button')].find((b) => b.textContent === COPY.linkYes)!.click())
    await settle()
    expect(svc.calls).toEqual(['peek t', 'logout', 'finish {"token":"t"}'])
    expect(useAccount.getState().session).toEqual({ session: 'sess', id: 'acct_1', email: 'ada@example.com' })
  })
  it('"Not me" discards the token and goes to the email step; an expired link lands there with the message', async () => {
    const svc = fakeService(false)
    const { host } = mount({ client: svc.client, token: 't' })
    await settle()
    act(() => [...host.querySelectorAll('button')].find((b) => b.textContent === COPY.linkNo)!.click())
    await settle()
    expect(text(host, '.ob-title')).toBe(COPY.email)
    expect(svc.calls).toEqual(['peek t'])
    expect(useAccount.getState().session).toBeNull()
    document.body.innerHTML = ''
    const bad = mount({ client: fakeService(false).client, token: 'stale' })
    await settle()
    expect(text(bad.host, '.ob-title')).toBe(COPY.email)
    expect(text(bad.host, '[role=alert]')).toBe('That code expired. Send a new one.')
  })
  it('logging in to an account with a vault asks for the passphrase and restores identity, profile and relay', async () => {
    const salt = new Uint8Array(16).fill(3)
    const plain: VaultPlain = { v: 1, signPriv: SIGN, kxPriv: KX, profile: ADA, settings: { units: 'km', relayUrl: 'https://relay.example.org', accountUrl: 'https://account.example.org' } }
    const vault = await encryptVault(await derive('open sesame', salt), salt, JSON.stringify(plain))
    const svc = fakeService(true, vault)
    const before = await loadKeys()
    db.store.set('crew:code', { value: 'PT-AAA-AAAA', madeAt: 1 })
    const { host, onDone } = mount({ client: svc.client, mode: 'login' })
    type(host.querySelector<HTMLInputElement>('#acct-email')!, 'ada@example.com'); submit(host); await settle()
    for (let i = 1; i <= 6; i++) type(digit(host, i), String(i))
    await settle()
    expect(text(host, '.ob-title')).toBe(COPY.unlockTitle)
    const pass = host.querySelector<HTMLInputElement>('#acct-unlock')!
    type(pass, 'wrong one'); submit(host); await settle()
    expect(text(host, '[role=alert]')).toBe("That's not it")
    expect(profile.get()).toBeNull()
    type(pass, 'open sesame'); submit(host); await settle()
    expect(onDone).toHaveBeenCalledWith({ restored: true })
    expect(profile.get()).toEqual(ADA)
    expect(settings.get().relayUrl).toBe('https://relay.example.org')
    const after = await loadKeys()
    expect(toHex(after.signPriv)).toBe(SIGN)
    expect(toHex(after.kxPriv)).toBe(KX)
    expect(toHex(after.signPriv)).not.toBe(toHex(before.signPriv))
    expect(db.store.get('crew:keys')).toEqual({ signSeed: SIGN, kxSeed: KX })
    // The share code on offer belonged to the old identity.
    expect(db.store.has('crew:code')).toBe(false)
    const a = useAccount.getState()
    expect(a.salt).toBe(vault.salt)
    expect(toHex(a.key!)).toBe(toHex(await derive('open sesame', salt)))
    expect(a.vaultAt).toBeGreaterThan(0)
    expect(fromHex(SIGN)).toHaveLength(32)
  })
  it('"Start over without my vault" keeps the session and leaves this device fresh', async () => {
    const svc = fakeService(true, await encryptVault(new Uint8Array(32), new Uint8Array(16), '{}'))
    const { host, onDone } = mount({ client: svc.client, mode: 'login' })
    type(host.querySelector<HTMLInputElement>('#acct-email')!, 'ada@example.com'); submit(host); await settle()
    for (let i = 1; i <= 6; i++) type(digit(host, i), String(i))
    await settle()
    await act(() => { [...host.querySelectorAll('button')].find((b) => b.textContent === COPY.startOver)!.click() })
    expect(onDone).toHaveBeenCalledWith({ restored: false })
    expect(useAccount.getState().session?.session).toBe('sess')
    expect(useAccount.getState().key).toBeNull()
    expect(profile.get()).toBeNull()
  })
  it('takeAuthToken reads #auth= from the address and clears it; other hashes are left alone', () => {
    const replaced: string[] = []
    const tok = 'ab'.repeat(32)
    expect(takeAuthToken({ hash: `#auth=${tok.toUpperCase()}`, pathname: '/v3/', search: '?x=1' }, (u) => replaced.push(u))).toBe(tok)
    expect(replaced).toEqual(['/v3/?x=1'])
    expect(takeAuthToken({ hash: '#settings', pathname: '/', search: '' }, (u) => replaced.push(u))).toBeNull()
    expect(takeAuthToken({ hash: '#auth=short', pathname: '/', search: '' }, (u) => replaced.push(u))).toBeNull()
    expect(replaced).toHaveLength(1)
  })
  it('Cancel hands control back when a closer is given', () => {
    const onClose = vi.fn()
    const { host } = mount({ client: fakeService().client, onClose })
    act(() => { [...host.querySelectorAll('button')].find((b) => b.textContent === COPY.cancel)!.click() })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
