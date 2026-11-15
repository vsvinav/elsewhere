import { CLOCK_SKEW_S, CODE_RE, HEX32_RE, ID_RE, deviceIdOf, signedMessage, unhex, verifySignature } from './ident'
import type { PairRecord } from './registry'

export { Room } from './room'
export { Registry } from './registry'

type Sig = { id: string; ts: string; sig: string }
const json = (body: unknown, status = 200) => Response.json(body, { status })
const text = (s: string, status: number) => new Response(s, { status })

const registry = (env: Env) => env.REGISTRY.get(env.REGISTRY.idFromName('main'))
const room = (env: Env, pairId: string) => env.ROOM.get(env.ROOM.idFromName(pairId))

const sigFrom = (req: Request, url: URL): Sig | null => {
  const id = req.headers.get('X-Elsewhere-Id') ?? url.searchParams.get('id')
  const ts = req.headers.get('X-Elsewhere-Ts') ?? url.searchParams.get('ts')
  const sig = req.headers.get('X-Elsewhere-Sig') ?? url.searchParams.get('sig')
  return id && ts && sig && ID_RE.test(id) ? { id, ts, sig } : null
}
const fresh = (ts: string, now: number) => { const t = Number(ts); return Number.isFinite(t) && Math.abs(now / 1000 - t) <= CLOCK_SKEW_S }

/** Parses the pairing body and checks the sender's signPub is really the key behind its id. */
async function pairRecord(body: string, id: string): Promise<PairRecord | null> {
  let b: { signPub?: unknown; kxPub?: unknown; name?: unknown }
  try { b = JSON.parse(body) } catch { return null }
  if (typeof b.signPub !== 'string' || typeof b.kxPub !== 'string' || typeof b.name !== 'string') return null
  if (!HEX32_RE.test(b.signPub) || !HEX32_RE.test(b.kxPub) || b.name.length > 40) return null
  if ((await deviceIdOf(unhex(b.signPub))) !== id) return null
  return { signPub: b.signPub, kxPub: b.kxPub, name: b.name, deviceId: id }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname
    if (path === '/healthz') return text('ok', 200)
    const now = Date.now()
    const sig = sigFrom(req, url)
    if (!sig || !fresh(sig.ts, now)) return text('unauthorized', 401)
    const body = req.method === 'GET' || req.method === 'DELETE' ? '' : await req.text()
    const reg = registry(env)

    // Pairing is the one place a device introduces its key; everything else looks the key up.
    const pairing = /^\/pair\/([^/]+)(\/claim)?$/.exec(path)
    const introducing = pairing && req.method === 'POST'
    const rec = introducing ? await pairRecord(body, sig.id) : null
    const signPub = introducing ? rec?.signPub ?? null : await reg.getDevice(sig.id)
    if (!signPub || !(await verifySignature(signPub, await signedMessage(req.method, path, sig.ts, body), sig.sig))) return text('unauthorized', 401)

    if (pairing) {
      const code = pairing[1]
      if (!CODE_RE.test(code)) return text('bad code', 400)
      if (introducing && !pairing[2]) {
        const r = await reg.createCode(code, rec!, now)
        if (r === 'limited') return text('too many codes', 429)
        if (r === 'exists') return text('taken', 409)
        await reg.putDevice(sig.id, rec!.signPub)
        return text('created', 201)
      }
      if (introducing) {
        const r = await reg.claimCode(code, rec!, req.headers.get('cf-connecting-ip') ?? 'unknown', now)
        if (r.status === 'ok') { await reg.putDevice(sig.id, rec!.signPub); return json(r.record) }
        if (r.status === 'limited') return text('too many claims', 429)
        if (r.status === 'missing') return text('no such code', 404)
        if (r.status === 'own') return text('your own code', 409)
        return text('already claimed', 410)
      }
      if (req.method === 'GET' && !pairing[2]) {
        const r = await reg.pollCode(code, sig.id, now)
        if (r.status === 'ready') return json(r.record)
        if (r.status === 'missing') return text('no such code', 404)
        if (r.status === 'forbidden') return text('not yours', 403)
        return new Response(null, { status: 204 })
      }
      return text('method', 405)
    }

    const roomPath = /^\/room\/([A-Z2-7]{16})(\/last)?$/.exec(path)
    if (roomPath && req.method === 'GET') {
      const pairId = roomPath[1]
      if (!(await reg.isMember(pairId, sig.id))) return text('not a member', 403)
      if (roomPath[2]) return json(await room(env, pairId).last(now))
      if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return text('expected websocket', 426)
      const h = new Headers(req.headers); h.set('x-elsewhere-member', sig.id)
      return room(env, pairId).fetch(new Request(req.url, { headers: h }))
    }

    if (path === '/devices/me' && req.method === 'DELETE') {
      const pairs = await reg.tombstone(sig.id)
      await Promise.all(pairs.map((pid) => room(env, pid).wipe(sig.id)))
      return new Response(null, { status: 204 })
    }
    return text('not found', 404)
  },
} satisfies ExportedHandler<Env>
