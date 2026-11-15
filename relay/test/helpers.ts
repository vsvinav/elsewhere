import { SELF } from 'cloudflare:test'
import { expect } from 'vitest'
import { base32nopad, hex, pairIdOf, sha256, unhex } from '../src/ident'

/** A test device: Ed25519 via WebCrypto from a fixed seed, plus an X25519 key the relay only stores. */
export interface Device { id: string; signPub: string; kxPub: string; sign(method: string, path: string, body: string, ts?: number): Promise<Record<string, string>> }

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
const b64url = (b: Uint8Array) => b64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export async function device(signSeedHex: string, signPubHex: string, kxPubHex: string): Promise<Device> {
  const jwk = { kty: 'OKP', crv: 'Ed25519', d: b64url(unhex(signSeedHex)), x: b64url(unhex(signPubHex)) }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['sign'])
  const id = base32nopad(await sha256(unhex(signPubHex))).slice(0, 16)
  return {
    id, signPub: signPubHex, kxPub: kxPubHex,
    async sign(method, path, body, ts = Math.floor(Date.now() / 1000)) {
      const bodyHash = hex(await sha256(new TextEncoder().encode(body)))
      const msg = new TextEncoder().encode(`${method}\n${path}\n${ts}\n${bodyHash}`)
      const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, key, msg))
      return { 'X-Elsewhere-Id': id, 'X-Elsewhere-Ts': String(ts), 'X-Elsewhere-Sig': b64(sig) }
    },
  }
}

// The web client's interop vectors (RFC 8032 / RFC 7748 seeds).
export const A = () => device('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a')
export const B = () => device('4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb', '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c', 'de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f')
export const C = () => device('c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7', 'fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025', '9c647d8f3b3e9b3f6d1c7f2c3d9e8a1b0c2d4e6f8a9b1c3d5e7f9a0b2c4d6e7f')
export const VECTOR_PAIR = 'YNSO47A5246FH5MO'
export const VECTOR_TS = 1763222520
export const VECTOR_SIG = 'aPiJjmu8O9PeEcaElvXDwThOPpM0rMyIC7aQqHMZNGMS44jb9ANMdmbIah8QJOng+VqClf5s8sZY8O44s4wvDg=='

export const record = (d: Device, name: string) => JSON.stringify({ signPub: d.signPub, kxPub: d.kxPub, name })
export const pairOf = async (a: Device, b: Device) => pairIdOf(unhex(a.signPub), unhex(b.signPub))

export async function signed(d: Device, method: string, path: string, body = '', init: { ts?: number; ip?: string; headers?: Record<string, string> } = {}) {
  const h = await d.sign(method, path, body, init.ts)
  return SELF.fetch(`https://relay${path}`, { method, body: method === 'GET' || method === 'DELETE' ? undefined : body, headers: { ...h, 'content-type': 'application/json', 'cf-connecting-ip': init.ip ?? '203.0.113.1', ...init.headers } })
}

/** Create a code as `a`, claim it as `b`, poll it as `a`: both sides hold each other's record and the relay knows the pair. */
export async function pair(a: Device, b: Device, code = 'PT-KSV-7Q4K') {
  expect((await signed(a, 'POST', `/pair/${code}`, record(a, 'Ana'))).status).toBe(201)
  expect((await signed(b, 'POST', `/pair/${code}/claim`, record(b, 'Bo'))).status).toBe(200)
  expect((await signed(a, 'GET', `/pair/${code}`)).status).toBe(200)
  return pairOf(a, b)
}

export async function wsQuery(d: Device, pairId: string, ts?: number) {
  const h = await d.sign('GET', `/room/${pairId}`, '', ts)
  return `?id=${h['X-Elsewhere-Id']}&ts=${h['X-Elsewhere-Ts']}&sig=${encodeURIComponent(h['X-Elsewhere-Sig'])}`
}
export async function joinRoom(d: Device, pairId: string) {
  const r = await SELF.fetch(`https://relay/room/${pairId}${await wsQuery(d, pairId)}`, { headers: { Upgrade: 'websocket' } })
  return r
}
export const nextMessage = (ws: WebSocket, ms = 2000) => new Promise<string>((res, rej) => {
  const t = setTimeout(() => rej(new Error('no message')), ms)
  ws.addEventListener('message', (e) => { clearTimeout(t); res(String(e.data)) }, { once: true })
})
export const envelope = (from: string, pad = 0) => JSON.stringify({ v: 1, from, n: 'AAECAwQFBgcICQoL', c: 'x'.repeat(24 + pad) })
