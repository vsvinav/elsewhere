import { SELF } from 'cloudflare:test'
import { expect, it } from 'vitest'

it('healthz answers ok without a signature', async () => {
  const r = await SELF.fetch('https://relay/healthz')
  expect(r.status).toBe(200)
  expect(await r.text()).toBe('ok')
})

it('answers a preflight on any route and marks every response, errors included, for cross-origin browsers', async () => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type, X-Elsewhere-Id, X-Elsewhere-Ts, X-Elsewhere-Sig', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'access-control-max-age': '86400' }
  for (const path of ['/pair/PT-KSV-7Q4K', '/room/YNSO47A5246FH5MO/last', '/devices/me', '/nowhere']) {
    const pre = await SELF.fetch(`https://relay${path}`, { method: 'OPTIONS', headers: { Origin: 'https://elsewhere.app', 'Access-Control-Request-Method': 'POST' } })
    expect(pre.status).toBe(204)
    for (const [k, v] of Object.entries(cors)) expect(pre.headers.get(k)).toBe(v)
  }
  const ok = await SELF.fetch('https://relay/healthz')
  expect(ok.headers.get('access-control-allow-origin')).toBe('*')
  const denied = await SELF.fetch('https://relay/room/YNSO47A5246FH5MO/last')
  expect(denied.status).toBe(401)
  for (const [k, v] of Object.entries(cors)) expect(denied.headers.get(k)).toBe(v)
})
