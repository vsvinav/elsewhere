// Signed HTTP calls and WebSocket rooms against the Crew relay.
import { signRequest, type DeviceKeys, type Envelope } from './keys'

/** What a device introduces itself as when pairing: hex keys, a signature binding kx to sign, display name. */
export interface PairRecord { signPub: string; kxPub: string; kxSig: string; name: string; deviceId: string }
export type MyRecord = Omit<PairRecord, 'deviceId'>

export class RelayError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'RelayError' }
}

export interface RelayClient {
  createCode(code: string, me: MyRecord): Promise<void>
  claimCode(code: string, me: MyRecord): Promise<PairRecord>
  /** null while the code is still waiting for someone. */
  pollCode(code: string): Promise<PairRecord | null>
  last(pairId: string): Promise<Envelope[]>
  deleteMe(): Promise<void>
}

export function relayClient(base: string, keys: DeviceKeys, fetchFn: typeof fetch = fetch): RelayClient {
  const root = base.replace(/\/+$/, '')
  const call = async (method: string, path: string, body?: unknown) => {
    const text = body === undefined ? '' : JSON.stringify(body)
    const headers: Record<string, string> = { ...signRequest(keys, method, path, text) }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const res = await fetchFn(root + path, { method, headers, body: body === undefined ? undefined : text })
    if (!res.ok) throw new RelayError(res.status, await res.text().catch(() => res.statusText))
    return res
  }
  return {
    createCode: async (code, me) => { await call('POST', `/pair/${code}`, me) },
    claimCode: async (code, me) => (await call('POST', `/pair/${code}/claim`, me)).json(),
    pollCode: async (code) => { const r = await call('GET', `/pair/${code}`); return r.status === 204 ? null : r.json() },
    last: async (pairId) => (await call('GET', `/room/${pairId}/last`)).json(),
    deleteMe: async () => { await call('DELETE', '/devices/me') },
  }
}

export const RECONNECT_MS = 2000

interface RoomsOpts { base: string; keys: DeviceKeys; pairIds: string[]; onEnvelope(e: Envelope): void; WS?: typeof WebSocket }

/** One socket per pair, reconnecting after a drop; returns a stop function. Outbound frames go through `send`. */
export function connectRooms(o: RoomsOpts): (() => void) & { send(pairId: string, e: Envelope): boolean } {
  const WS = o.WS ?? WebSocket
  const wsBase = o.base.replace(/\/+$/, '').replace(/^http/, 'ws')
  const sockets = new Map<string, WebSocket>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  let stopped = false
  const dial = (pairId: string) => {
    if (stopped) return
    const path = `/room/${pairId}`
    const h = signRequest(o.keys, 'GET', path, '')
    const q = new URLSearchParams({ id: h['X-Elsewhere-Id'], ts: h['X-Elsewhere-Ts'], sig: h['X-Elsewhere-Sig'] })
    const ws = new WS(`${wsBase}${path}?${q}`)
    sockets.set(pairId, ws)
    ws.onmessage = (ev) => {
      let e: Envelope
      try { e = JSON.parse(String(ev.data)) } catch { return }
      if (e && e.v === 1 && typeof e.from === 'string' && typeof e.n === 'string' && typeof e.c === 'string') o.onEnvelope(e)
    }
    ws.onclose = () => {
      if (sockets.get(pairId) !== ws) return
      sockets.delete(pairId)
      if (!stopped) timers.set(pairId, setTimeout(() => { timers.delete(pairId); dial(pairId) }, RECONNECT_MS))
    }
  }
  for (const id of o.pairIds) dial(id)
  const stop = () => {
    stopped = true
    for (const t of timers.values()) clearTimeout(t)
    timers.clear()
    for (const ws of sockets.values()) { try { ws.close() } catch { /* already gone */ } }
    sockets.clear()
  }
  stop.send = (pairId: string, e: Envelope) => {
    const ws = sockets.get(pairId)
    if (!ws || ws.readyState !== 1) return false
    ws.send(JSON.stringify(e))
    return true
  }
  return stop
}
