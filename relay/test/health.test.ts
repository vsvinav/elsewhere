import { SELF } from 'cloudflare:test'
import { expect, it } from 'vitest'

it('healthz answers ok without a signature', async () => {
  const r = await SELF.fetch('https://relay/healthz')
  expect(r.status).toBe(200)
  expect(await r.text()).toBe('ok')
})
