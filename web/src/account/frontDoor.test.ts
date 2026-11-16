import { describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ store: new Map<string, unknown>() }))
vi.mock('../ingest/db', () => ({ kv: { get: async (k: string) => db.store.get(k), set: async (k: string, v: unknown) => { db.store.set(k, v) }, del: async (k: string) => { db.store.delete(k) } } }))

import { frontDoor } from './frontDoor'
import { resetAccountForTest, useAccount } from './store'

const fresh = { loaded: true, session: null, welcomed: false }
const ses = { session: 's', id: 'acct_1', email: 'a@b.co' }

describe('frontDoor', () => {
  it('holds a mail-link sign-in until the stored account has loaded, so load() cannot overwrite the new session', async () => {
    db.store.clear(); resetAccountForTest()
    const a = useAccount.getState()
    expect(frontDoor(a, true, false)).toBe('loading')
    // Had the flow run now, this is what would happen: finish stores a session, then the slower load() erases it.
    await a.setSession(ses); db.store.delete('account:session')
    await a.load()
    expect(useAccount.getState().session).toBeNull()
    // Gated the other way round the session survives.
    db.store.clear(); resetAccountForTest()
    await useAccount.getState().load()
    expect(frontDoor(useAccount.getState(), true, false)).toBe('auth')
    await useAccount.getState().setSession(ses)
    expect(useAccount.getState().session).toEqual(ses)
  })
  it('welcomes a fresh device once, and lets a profile, a session or a past welcome straight through', () => {
    expect(frontDoor(fresh, false, false)).toBe('welcome')
    expect(frontDoor({ ...fresh, welcomed: true }, false, false)).toBe('through')
    expect(frontDoor({ ...fresh, session: ses }, false, false)).toBe('through')
    expect(frontDoor(fresh, false, true)).toBe('through')
    expect(frontDoor({ ...fresh, session: ses }, true, true)).toBe('auth')
  })
})
