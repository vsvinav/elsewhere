import { DurableObject } from 'cloudflare:workers'
import { pairIdOf, unhex } from './ident'

/** What a device publishes to pair: its two public keys and the name it wants shown. */
export interface PairRecord { signPub: string; kxPub: string; name: string; deviceId: string }
interface Code { owner: string; a: PairRecord; b?: PairRecord; createdAt: number; consumed: boolean }

export const CODE_TTL_MS = 24 * 3600 * 1000
const CREATES_PER_HOUR = 10
const CLAIMS_PER_HOUR = 30
const HOUR_MS = 3600 * 1000

/**
 * One registry for the whole relay: deviceId → signPub, live share codes, and which two devices make a pair.
 * It never holds anything readable beyond that.
 */
export class Registry extends DurableObject<Env> {
  private get store() { return this.ctx.storage }

  async getDevice(id: string): Promise<string | null> { return (await this.store.get<string>(`dev:${id}`)) ?? null }
  async putDevice(id: string, signPub: string): Promise<void> { await this.store.put(`dev:${id}`, signPub) }

  private async bump(key: string, limit: number, now: number): Promise<boolean> {
    const k = `${key}:${Math.floor(now / HOUR_MS)}`
    const n = (await this.store.get<number>(k)) ?? 0
    if (n >= limit) return false
    await this.store.put(k, n + 1)
    return true
  }
  private async code(code: string, now: number): Promise<Code | null> {
    const c = await this.store.get<Code>(`code:${code}`)
    if (!c) return null
    if (now - c.createdAt >= CODE_TTL_MS) { await this.store.delete(`code:${code}`); return null }
    return c
  }

  async createCode(code: string, rec: PairRecord, now: number): Promise<'created' | 'exists' | 'limited'> {
    if (await this.code(code, now)) return 'exists'
    if (!(await this.bump(`rate:create:${rec.deviceId}`, CREATES_PER_HOUR, now))) return 'limited'
    await this.store.put(`code:${code}`, { owner: rec.deviceId, a: rec, createdAt: now, consumed: false } satisfies Code)
    return 'created'
  }

  async claimCode(code: string, rec: PairRecord, ip: string, now: number): Promise<{ status: 'ok'; record: PairRecord } | { status: 'limited' | 'missing' | 'own' | 'used' }> {
    if (!(await this.bump(`rate:claim:${ip}`, CLAIMS_PER_HOUR, now))) return { status: 'limited' }
    const c = await this.code(code, now)
    if (!c) return { status: 'missing' }
    if (c.owner === rec.deviceId) return { status: 'own' }
    if (c.consumed) return { status: 'used' }
    const pairId = await pairIdOf(unhex(c.a.signPub), unhex(rec.signPub))
    await this.store.put(`code:${code}`, { ...c, b: rec, consumed: true } satisfies Code)
    await this.store.put(`pair:${pairId}`, [c.owner, rec.deviceId])
    await this.store.put(`member:${c.owner}:${pairId}`, true)
    await this.store.put(`member:${rec.deviceId}:${pairId}`, true)
    return { status: 'ok', record: c.a }
  }

  async pollCode(code: string, id: string, now: number): Promise<{ status: 'ready'; record: PairRecord } | { status: 'pending' | 'missing' | 'forbidden' }> {
    const c = await this.code(code, now)
    if (!c) return { status: 'missing' }
    if (c.owner !== id) return { status: 'forbidden' }
    if (!c.b) return { status: 'pending' }
    await this.store.delete(`code:${code}`)
    return { status: 'ready', record: c.b }
  }

  async isMember(pairId: string, id: string): Promise<boolean> { return !!(await this.store.get(`member:${id}:${pairId}`)) }

  /** Forgets the device; returns the pairs it was in so their rooms can drop its last ping. */
  async tombstone(id: string): Promise<string[]> {
    const pairs: string[] = []
    for (const key of (await this.store.list({ prefix: `member:${id}:` })).keys()) pairs.push(key.slice(`member:${id}:`.length))
    for (const [key, c] of await this.store.list<Code>({ prefix: 'code:' })) if (c.owner === id || c.b?.deviceId === id) await this.store.delete(key)
    for (const pid of pairs) {
      const members = (await this.store.get<string[]>(`pair:${pid}`)) ?? []
      for (const m of members) await this.store.delete(`member:${m}:${pid}`)
      await this.store.delete(`pair:${pid}`)
    }
    await this.store.delete(`dev:${id}`)
    return pairs
  }
}
