// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const db = vi.hoisted(() => {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) })
  return { store: new Map<string, unknown>() }
})
vi.mock('../ingest/db', () => ({ kv: { get: async (k: string) => db.store.get(k), set: async (k: string, v: unknown) => { db.store.set(k, v) }, del: async (k: string) => { db.store.delete(k) } } }))

import { BAD_KEYS, Crew, CONFIRM_REMOVE, EMPTY_RELAY, NO_FRIENDS, SONAR_COPY, VIEWER_NOTE } from './Crew'
import { useCrew, type Friend } from './friends'
import { deviceIdOf, fingerprint, fromHex, keysFromSeeds, kxSigOf, pairIdOf, pairKeyOf, setKeysForTest, toHex } from './keys'
import { settings } from '../ingest/settings'
import { profile } from '../profile/profile'
import { useStore } from '../store/useStore'
import vectors from './vectors.json'

const A = keysFromSeeds(fromHex(vectors.a.signSeed), fromHex(vectors.a.kxSeed))
const B = keysFromSeeds(fromHex(vectors.b.signSeed), fromHex(vectors.b.kxSeed))
const bRecord = { signPub: toHex(B.signPub), kxPub: toHex(B.kxPub), kxSig: kxSigOf(B), name: 'Marta', deviceId: deviceIdOf(B.signPub) }
const pid = pairIdOf(A.signPub, B.signPub)
const { kxSig: _kxSig, ...bKeys } = bRecord
const marta: Friend = { ...bKeys, pairId: pid, pairKey: toHex(pairKeyOf(A.kxPriv, B.kxPub, pid)), addedAt: Date.UTC(2025, 10, 15), grants: { liveCity: false, livePrecise: false, sonar: false } }

const fakeRelay = (answers: Record<string, (path: string) => Response>) => {
  const calls: { method: string; path: string }[] = []
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input)); const method = init?.method ?? 'GET'
    calls.push({ method, path: url.pathname })
    const hit = Object.entries(answers).find(([k]) => { const [m, re] = k.split(' '); return m === method && new RegExp(`^${re}$`).test(url.pathname) })
    return hit ? hit[1](url.pathname) : new Response('nope', { status: 404 })
  }) as typeof fetch
  return { calls, fetchFn }
}

const mount = (fetchFn: typeof fetch) => {
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  act(() => root.render(createElement(Crew, { fetchFn, pollMs: 20 })))
  const flush = () => act(() => new Promise((r) => setTimeout(r, 40)))
  return { host, flush, unmount: () => act(() => root.unmount()) }
}
const click = (el: Element | null) => act(() => { (el as HTMLElement).click() })
const byText = (host: Element, sel: string, text: string) => [...host.querySelectorAll(sel)].find((e) => e.textContent?.trim() === text) ?? null
const setValue = (el: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(async () => {
  db.store.clear()
  setKeysForTest(A)
  settings.set({ relayUrl: 'https://relay.test' })
  profile.set({ name: 'Ana', units: 'km', homes: [], works: [] })
  useStore.setState({ crewOpen: true, tab: 'home' })
  useCrew.setState({ loaded: false, friends: [], fixes: {}, hit: null, tag: null })
  useCrew.getState().setSender(null)
  await useCrew.getState().load()
  document.body.innerHTML = ''
})
afterEach(() => vi.restoreAllMocks())

describe('Crew', () => {
  it('shows the header count, a share code that was offered to the relay, and the viewer note', async () => {
    const { calls, fetchFn } = fakeRelay({ 'POST /pair/PT-[A-Z0-9]{3}-[A-Z0-9]{4}': () => new Response('created', { status: 201 }), 'GET /pair/.*': () => new Response(null, { status: 204 }) })
    const { host, flush, unmount } = mount(fetchFn)
    await flush()
    expect(host.querySelector('.crew-head')?.textContent).toBe('CREW · no friends yet')
    expect(host.querySelector('h1')?.textContent).toBe('CREW')
    const code = host.querySelector('.code')!.textContent!
    expect(code).toMatch(/^PT-[0-9A-HJKMNP-TV-Z]{3}-[0-9A-HJKMNP-TV-Z]{4}$/)
    expect(calls[0]).toEqual({ method: 'POST', path: `/pair/${code}` })
    expect(host.textContent).toContain('Expires in 24 h')
    expect(host.textContent).toContain(VIEWER_NOTE)
    expect(host.textContent).toContain(NO_FRIENDS)
    unmount()
  })

  it('offers the code once, even as the sheet re-renders around it, and keeps polling', async () => {
    await useCrew.getState().add(marta)
    let posts = 0
    const { calls, fetchFn } = fakeRelay({ 'POST /pair/PT-[A-Z0-9]{3}-[A-Z0-9]{4}': () => new Response(posts++ === 0 ? 'created' : 'taken', { status: posts === 1 ? 201 : 409 }), 'GET /pair/.*': () => new Response(null, { status: 204 }) })
    const { host, flush, unmount } = mount(fetchFn)
    await flush()
    click(host.querySelector('.friend input[name=sonar]'))
    await flush()
    const pollsBefore = calls.filter((c) => c.method === 'GET').length
    await flush()
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
    expect(calls.filter((c) => c.method === 'GET').length).toBeGreaterThan(pollsBefore)
    expect(host.querySelector('.expiry')!.textContent).toMatch(/^Expires in/)
    unmount()
  })
  it('keeps one code for 24 h across opens; New code or a claim mints another', async () => {
    const { calls, fetchFn } = fakeRelay({ 'POST /pair/.*': () => new Response('created', { status: 201 }), 'GET /pair/.*': () => new Response(null, { status: 204 }) })
    const first = mount(fetchFn)
    await first.flush()
    const shown = first.host.querySelector('.code')!.textContent!
    expect(db.store.get('crew:code')).toMatchObject({ value: shown, offeredAt: expect.any(Number) })
    first.unmount()
    const again = mount(fetchFn)
    await again.flush()
    expect(again.host.querySelector('.code')!.textContent).toBe(shown)
    expect(again.host.querySelector('.expiry')!.textContent).toMatch(/^Expires in/)
    again.unmount()
    const second = mount(fetchFn)
    await second.flush()
    expect(second.host.querySelector('.code')!.textContent).toBe(shown)
    // An offered code is not offered again on later opens; the relay counts every POST against the device.
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
    click(byText(second.host, 'button', 'New code'))
    await second.flush()
    const minted = second.host.querySelector('.code')!.textContent!
    expect(minted).not.toBe(shown)
    expect(db.store.get('crew:code')).toMatchObject({ value: minted })
    second.unmount()
    db.store.set('crew:code', { value: minted, madeAt: Date.now() - 25 * 3600_000 })
    const third = mount(fetchFn)
    await third.flush()
    expect(third.host.querySelector('.code')!.textContent).not.toBe(minted)
    third.unmount()
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.path.slice(-11))).toEqual([shown, minted, expect.not.stringMatching(minted)])
  })
  it('without a relay it only says where to set one', async () => {
    settings.set({ relayUrl: '' })
    const { host, flush, unmount } = mount(fakeRelay({}).fetchFn)
    await flush()
    expect(host.textContent).toContain(EMPTY_RELAY)
    expect(host.querySelector('.code')).toBeNull()
    unmount()
  })

  it('entering a friend\'s code opens the confirm sheet; nothing is saved until Pair is confirmed', async () => {
    const { fetchFn } = fakeRelay({ 'POST /pair/PT-KSV-7Q4K/claim': () => Response.json(bRecord), 'POST /pair/.*': () => new Response('created', { status: 201 }), 'GET /pair/.*': () => new Response(null, { status: 204 }) })
    const { host, flush, unmount } = mount(fetchFn)
    await flush()
    act(() => setValue(host.querySelector<HTMLInputElement>('#crew-code')!, 'pt ksv 7q4k'))
    click(byText(host, 'button', 'Pair'))
    await flush()
    const sheet = host.querySelector('.crew-confirm')!
    expect(sheet.textContent).toContain('Pair with')
    expect(sheet.querySelector('b')?.textContent).toBe('Marta')
    expect(sheet.textContent).toContain(fingerprint(B.signPub, B.kxPub))
    expect(useCrew.getState().friends).toEqual([])
    click(byText(sheet, 'button', 'Yes, pair'))
    await flush()
    expect(useCrew.getState().friends[0]).toMatchObject({ name: 'Marta', pairId: pid, grants: { liveCity: false, livePrecise: false, sonar: false } })
    expect(host.querySelector('.crew-head')?.textContent).toBe('CREW · 1 friend')
    expect(byText(host, '.friend .nm', 'Marta')).toBeTruthy()
    unmount()
  })

  it('a claim of my code arrives through polling and can be declined', async () => {
    let claimed = ''
    const { fetchFn } = fakeRelay({ 'POST /pair/.*': () => new Response('created', { status: 201 }), 'GET /pair/.*': (path) => (path.endsWith(claimed) ? Response.json(bRecord) : new Response(null, { status: 204 })) })
    const { host, flush, unmount } = mount(fetchFn)
    await flush()
    const first = host.querySelector('.code')!.textContent!
    claimed = first
    await flush(); await flush()
    expect(host.querySelector('.crew-confirm b')?.textContent).toBe('Marta')
    click(byText(host.querySelector('.crew-confirm')!, 'button', 'No'))
    expect(host.querySelector('.crew-confirm')).toBeNull()
    expect(useCrew.getState().friends).toEqual([])
    // The claimed code is spent on the relay, so a fresh one takes its place.
    expect(host.querySelector('.code')!.textContent).not.toBe(first)
    expect(db.store.get('crew:code')).not.toMatchObject({ value: first })
    unmount()
  })

  it('a record with a swapped kx key is refused in words', async () => {
    const { fetchFn } = fakeRelay({ 'POST /pair/PT-KSV-7Q4K/claim': () => Response.json({ ...bRecord, kxPub: toHex(A.kxPub) }), 'POST /pair/.*': () => new Response('created', { status: 201 }), 'GET /pair/.*': () => new Response(null, { status: 204 }) })
    const { host, flush, unmount } = mount(fetchFn)
    await flush()
    act(() => setValue(host.querySelector<HTMLInputElement>('#crew-code')!, 'PT-KSV-7Q4K'))
    click(byText(host, 'button', 'Pair'))
    await flush()
    expect(host.querySelector('.crew-status')?.textContent).toBe(BAD_KEYS)
    expect(host.querySelector('.crew-confirm')).toBeNull()
    unmount()
  })

  it('a wrong code is reported in words', async () => {
    const { fetchFn } = fakeRelay({ 'POST /pair/PT-ZZZ-ZZZZ/claim': () => new Response('no such code', { status: 404 }), 'POST /pair/.*': () => new Response('created', { status: 201 }), 'GET /pair/.*': () => new Response(null, { status: 204 }) })
    const { host, flush, unmount } = mount(fetchFn)
    await flush()
    act(() => setValue(host.querySelector<HTMLInputElement>('#crew-code')!, 'PT-ZZZ-ZZZZ'))
    click(byText(host, 'button', 'Pair'))
    await flush()
    expect(host.querySelector('.crew-status')?.textContent).toBe('No such code. Check it and try again.')
    unmount()
  })

  it('toggles persist, Sonar brings city along, mute lasts until midnight, Remove sends a revoke', async () => {
    await useCrew.getState().add(marta)
    const sent: unknown[] = []
    useCrew.getState().setSender((p, m) => { sent.push([p, m]) })
    const { fetchFn } = fakeRelay({ 'POST /pair/.*': () => new Response('created', { status: 201 }), 'GET /pair/.*': () => new Response(null, { status: 204 }) })
    const { host, flush, unmount } = mount(fetchFn)
    await flush()
    const card = host.querySelector('.friend')!
    expect(card.textContent).toContain(fingerprint(B.signPub, B.kxPub))
    expect(card.textContent).toContain(SONAR_COPY)
    const sonar = card.querySelector<HTMLInputElement>('input[name=sonar]')!
    click(sonar)
    await flush()
    expect((db.store.get('crew:friends') as Friend[])[0].grants).toEqual({ liveCity: true, livePrecise: false, sonar: true })
    click(byText(card, 'button', 'Mute Sonar for today'))
    await flush()
    const until = (db.store.get('crew:friends') as Friend[])[0].mutedUntil!
    expect(new Date(until).getHours()).toBe(0)
    expect(until).toBeGreaterThan(Date.now())
    expect(byText(card, 'button', 'Muted for today · unmute')).toBeTruthy()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    click(byText(card, 'button', 'Remove'))
    await flush()
    expect(window.confirm).toHaveBeenCalledWith(CONFIRM_REMOVE('Marta'))
    expect(sent).toEqual([[pid, { type: 'revoke' }]])
    expect(useCrew.getState().friends).toEqual([])
    unmount()
  })
})
