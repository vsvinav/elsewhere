import { DurableObject } from 'cloudflare:workers'

export const LAST_TTL_MS = 15 * 60 * 1000
export const MAX_MESSAGE_BYTES = 512
export const MIN_GAP_MS = 10_000

interface Last { env: unknown; at: number }
interface Peer { id: string; lastSentAt: number }

/**
 * One room per pair. Fans each message to the other member and keeps the newest envelope per sender for 15 minutes so a
 * late joiner sees the latest ping. Members hibernate between messages; who they are rides on the socket attachment.
 */
export class Room extends DurableObject<Env> {
  async fetch(req: Request): Promise<Response> {
    const id = req.headers.get('x-elsewhere-member')
    if (!id || req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('expected websocket', { status: 426 })
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    this.ctx.acceptWebSocket(server, [id])
    server.serializeAttachment({ id, lastSentAt: 0 } satisfies Peer)
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE_BYTES) return
    const peer = ws.deserializeAttachment() as Peer
    const now = Date.now()
    if (now - peer.lastSentAt < MIN_GAP_MS) return
    let env: { v?: number; from?: string }
    try { env = JSON.parse(message) } catch { return }
    if (env.v !== 1 || env.from !== peer.id) return
    ws.serializeAttachment({ ...peer, lastSentAt: now } satisfies Peer)
    await this.ctx.storage.put(`last:${peer.id}`, { env, at: now } satisfies Last)
    for (const other of this.ctx.getWebSockets()) if (other !== ws && (other.deserializeAttachment() as Peer).id !== peer.id) { try { other.send(message) } catch { /* gone */ } }
  }

  async webSocketClose(ws: WebSocket): Promise<void> { try { ws.close() } catch { /* already closed */ } }
  async webSocketError(ws: WebSocket): Promise<void> { try { ws.close() } catch { /* already closed */ } }

  /** Both members' newest envelopes, still within the TTL. */
  async last(now: number): Promise<unknown[]> {
    const out: unknown[] = []
    for (const [key, v] of await this.ctx.storage.list<Last>({ prefix: 'last:' })) {
      if (now - v.at > LAST_TTL_MS) { await this.ctx.storage.delete(key); continue }
      out.push(v.env)
    }
    return out
  }

  async wipe(id: string): Promise<void> {
    await this.ctx.storage.delete(`last:${id}`)
    for (const ws of this.ctx.getWebSockets(id)) { try { ws.close(1000, 'gone') } catch { /* already closed */ } }
  }
}
