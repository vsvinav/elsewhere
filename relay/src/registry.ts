import { DurableObject } from 'cloudflare:workers'
import { pairIdOf, unhex } from './ident'

/** What a device publishes to pair: its two public keys and the name it wants shown. */
export interface PairRecord { signPub: string; kxPub: string; kxSig: string; name: string; deviceId: string }
interface Code { owner: string; a: PairRecord; b?: PairRecord; createdAt: number; consumed: boolean; exp: number }
/** A device's signing key; `exp` is set until it is in a pair, so a key that only ever made a code is forgotten after a day. */
interface Device { signPub: string; exp?: number }

const HOUR_MS = 3600 * 1000
export const CODE_TTL_MS = 24 * HOUR_MS
/** A lone device outlives its last code by an hour, so polling right up to the code's end still gets a plain "no such code". */
const DEVICE_TTL_MS = CODE_TTL_MS + HOUR_MS
const CREATES_PER_HOUR = 10
const CREATES_PER_HOUR_IP = 30
const CLAIMS_PER_HOUR = 30
const SWEEP_MS = 10 * 60_000

/**
 * One registry for the whole relay: deviceId → signPub, live share codes, and which two devices make a pair.
 * It never holds anything readable beyond that. Everything but pairs carries an `exp` and is swept by the alarm.
 */
export class Registry extends DurableObject<Env> {
  private get store() { return this.ctx.storage }

  async getDevice(id: string): Promise<string | null> {
    const d = await this.store.get<Device | string>(`dev:${id}`)
    // Records from before devices carried an expiry are bare keys.
    if (typeof d === 'string') return d
    return d && (d.exp === undefined || d.exp > Date.now()) ? d.signPub : null
  }
  async putDevice(id: string, signPub: string): Promise<void> {
    const paired = (await this.store.list({ prefix: `member:${id}:`, limit: 1 })).size > 0
    await this.store.put(`dev:${id}`, paired ? { signPub } : { signPub, exp: Date.now() + DEVICE_TTL_MS } satisfies Device)
    await this.arm()
  }

  private async bump(key: string, limit: number, now: number): Promise<boolean> {
    const hour = Math.floor(now / HOUR_MS)
    const k = `${key}:${hour}`
    const n = (await this.store.get<{ n: number }>(k))?.n ?? 0
    if (n >= limit) return false
    await this.store.put(k, { n: n + 1, exp: (hour + 2) * HOUR_MS })
    await this.arm()
    return true
  }
  private async code(code: string, now: number): Promise<Code | null> {
    const c = await this.store.get<Code>(`code:${code}`)
    if (!c) return null
    if (now - c.createdAt >= CODE_TTL_MS) { await this.dropCode(code, c); return null }
    return c
  }
  /** The code and its owner-index entries go together, so a tombstone never has to scan for them. */
  private async dropCode(code: string, c: Code) {
    const keys = [`code:${code}`, `owner:${c.owner}:${code}`]
    if (c.b) keys.push(`owner:${c.b.deviceId}:${code}`)
    await this.store.delete(keys)
  }

  /** Counters move before the lookup, so probing for live codes costs the same as making them and tells a stranger nothing. */
  async createCode(code: string, rec: PairRecord, ip: string, now: number): Promise<'created' | 'own' | 'taken' | 'limited'> {
    const byDevice = await this.bump(`rate:create:${rec.deviceId}`, CREATES_PER_HOUR, now)
    const byIp = await this.bump(`rate:create-ip:${ip}`, CREATES_PER_HOUR_IP, now)
    if (!byDevice || !byIp) return 'limited'
    const live = await this.code(code, now)
    if (live) return live.owner === rec.deviceId ? 'own' : 'taken'
    const exp = now + CODE_TTL_MS
    await this.store.put({ [`code:${code}`]: { owner: rec.deviceId, a: rec, createdAt: now, consumed: false, exp } satisfies Code, [`owner:${rec.deviceId}:${code}`]: { exp } })
    return 'created'
  }

  async claimCode(code: string, rec: PairRecord, ip: string, now: number): Promise<{ status: 'ok'; record: PairRecord } | { status: 'limited' | 'missing' | 'own' | 'used' }> {
    if (!(await this.bump(`rate:claim:${ip}`, CLAIMS_PER_HOUR, now))) return { status: 'limited' }
    const c = await this.code(code, now)
    if (!c) return { status: 'missing' }
    if (c.owner === rec.deviceId) return { status: 'own' }
    if (c.consumed) return { status: 'used' }
    const pairId = await pairIdOf(unhex(c.a.signPub), unhex(rec.signPub))
    await this.store.put({
      [`code:${code}`]: { ...c, b: rec, consumed: true } satisfies Code,
      [`owner:${rec.deviceId}:${code}`]: { exp: c.exp },
      [`pair:${pairId}`]: [c.owner, rec.deviceId],
      [`member:${c.owner}:${pairId}`]: true,
      [`member:${rec.deviceId}:${pairId}`]: true,
      // Both are in a pair now, so their keys stay as long as it does.
      [`dev:${c.owner}`]: { signPub: c.a.signPub } satisfies Device,
    })
    return { status: 'ok', record: c.a }
  }

  async pollCode(code: string, id: string, now: number): Promise<{ status: 'ready'; record: PairRecord } | { status: 'pending' | 'missing' | 'forbidden' }> {
    const c = await this.code(code, now)
    if (!c) return { status: 'missing' }
    if (c.owner !== id) return { status: 'forbidden' }
    if (!c.b) return { status: 'pending' }
    await this.dropCode(code, c)
    return { status: 'ready', record: c.b }
  }

  async isMember(pairId: string, id: string): Promise<boolean> { return !!(await this.store.get(`member:${id}:${pairId}`)) }

  /** Forgets the device; returns the pairs it was in so their rooms can drop its last ping. */
  async tombstone(id: string): Promise<string[]> {
    const pairs: string[] = []
    for (const key of (await this.store.list({ prefix: `member:${id}:` })).keys()) pairs.push(key.slice(`member:${id}:`.length))
    for (const key of (await this.store.list({ prefix: `owner:${id}:` })).keys()) {
      const code = key.slice(`owner:${id}:`.length)
      const c = await this.store.get<Code>(`code:${code}`)
      if (c) await this.dropCode(code, c); else await this.store.delete(key)
    }
    for (const pid of pairs) {
      const members = (await this.store.get<string[]>(`pair:${pid}`)) ?? []
      for (const m of members) await this.store.delete(`member:${m}:${pid}`)
      await this.store.delete(`pair:${pid}`)
    }
    await this.store.delete(`dev:${id}`)
    return pairs
  }

  private async arm() { if ((await this.store.getAlarm()) === null) await this.store.setAlarm(Date.now() + SWEEP_MS) }

  /** Forgets codes, counters and lone devices whose time has passed; stands down once nothing timed is left. */
  async alarm(): Promise<void> {
    const now = Date.now()
    const all = await this.store.list<{ exp?: number }>()
    const timed = [...all].filter(([, v]) => typeof v === 'object' && v !== null && typeof v.exp === 'number')
    const dead = timed.filter(([, v]) => v.exp! <= now).map(([k]) => k)
    if (dead.length) await this.store.delete(dead)
    if (timed.length > dead.length) await this.store.setAlarm(now + SWEEP_MS)
  }
}
