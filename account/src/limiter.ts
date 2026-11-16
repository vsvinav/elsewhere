import { DurableObject } from 'cloudflare:workers'

/** A pending magic code: who asked, what was sent, how many wrong guesses so far, and when it stops working. */
export interface TokenRec { email: string; code: string; tries: number; exp: number }
export type TryResult = { ok: 'ok'; email: string } | { ok: 'wrong' } | { ok: 'expired' }

const MAX_TRIES = 5
const SWEEP_MS = 10 * 60_000

/**
 * Every counter the service relies on lives here, so each check is one atomic step: KV is eventually consistent and
 * has no compare-and-swap, which would let a burst of guesses or starts slip past a limit. One instance serves all.
 */
export class Limiter extends DurableObject<Env> {
  private get store() { return this.ctx.storage }

  /** Counts `key` in the current `ttlS` window; allowed while the count stays within `max`. */
  async bump(key: string, ttlS: number, max: number, now: number): Promise<{ allowed: boolean; count: number }> {
    const ttl = ttlS * 1000
    const k = `rl:${key}:${Math.floor(now / ttl)}`
    const count = ((await this.store.get<{ n: number }>(k))?.n ?? 0) + 1
    await this.store.put(k, { n: count, exp: (Math.floor(now / ttl) + 1) * ttl })
    await this.arm()
    return { allowed: count <= max, count }
  }

  /** Stores a fresh code and makes it the one `email` answers to. */
  async putToken(token: string, rec: Omit<TokenRec, 'tries'>): Promise<void> {
    await this.store.put({ [`tok:${token}`]: { ...rec, tries: 0 }, [`start:${rec.email}`]: { token, exp: rec.exp } })
    await this.arm()
  }

  /** The address behind a live token, for the "Log in as…?" prompt. */
  async peek(token: string, now: number): Promise<string | null> {
    const rec = await this.store.get<TokenRec>(`tok:${token}`)
    return rec && rec.exp > now ? rec.email : null
  }

  /**
   * One guess, or a link token (`code` null). The compare, the try count and the deletion happen inside this single
   * call, so parallel guesses cannot share a try.
   */
  async tryCode(by: { token: string } | { email: string }, code: string | null, now: number): Promise<TryResult> {
    const token = 'token' in by ? by.token : (await this.store.get<{ token: string }>(`start:${by.email}`))?.token
    if (!token) return { ok: 'expired' }
    const key = `tok:${token}`
    const rec = await this.store.get<TokenRec>(key)
    if (!rec || rec.exp <= now) { await this.store.delete(key); return { ok: 'expired' } }
    if (code !== null && !sameCode(code, rec.code)) {
      rec.tries++
      if (rec.tries >= MAX_TRIES) { await this.drop(token, rec.email); return { ok: 'expired' } }
      await this.store.put(key, rec)
      return { ok: 'wrong' }
    }
    await this.drop(token, rec.email)
    return { ok: 'ok', email: rec.email }
  }

  /** Removes the token, and the email's pointer only if it still names this token (a newer start owns it otherwise). */
  private async drop(token: string, email: string) {
    await this.store.delete(`tok:${token}`)
    if ((await this.store.get<{ token: string }>(`start:${email}`))?.token === token) await this.store.delete(`start:${email}`)
  }

  private async arm() { if ((await this.store.getAlarm()) === null) await this.store.setAlarm(Date.now() + SWEEP_MS) }

  /** Forgets counters and codes whose time has passed. */
  async alarm(): Promise<void> {
    const now = Date.now()
    const all = await this.store.list<{ exp: number }>()
    const dead = [...all].filter(([, v]) => typeof v?.exp === 'number' && v.exp <= now).map(([k]) => k)
    if (dead.length) await this.store.delete(dead)
    if (all.size > dead.length) await this.store.setAlarm(now + SWEEP_MS)
  }
}

function sameCode(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const x = enc.encode(a), y = enc.encode(b)
  if (x.byteLength !== y.byteLength) return false
  return crypto.subtle.timingSafeEqual(x, y)
}
