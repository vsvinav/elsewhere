import { describe, expect, it } from 'vitest'
import { checkKey, hintFor } from './keycheck'

const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('checkKey', () => {
  it('accepts a 200 and sends the key with an id-only mask', async () => {
    let seen: RequestInit | undefined
    const f = (async (_u: RequestInfo | URL, init?: RequestInit) => { seen = init; return new Response('{"id":"x"}', { status: 200 }) }) as unknown as typeof fetch
    expect(await checkKey('AIza', f)).toEqual({ ok: true })
    expect((seen?.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('AIza')
    expect((seen?.headers as Record<string, string>)['X-Goog-FieldMask']).toBe('id')
  })
  it('passes the Google message through verbatim, with a hint', async () => {
    const msg = 'API keys with referer restrictions cannot be used with this API.'
    const p = await checkKey('k', reply(403, { error: { message: msg, status: 'PERMISSION_DENIED' } }))
    expect(p).toMatchObject({ ok: false, message: msg })
    expect((p as { hint: string }).hint).toMatch(/allowed websites/)
  })
  it('falls back to the status line on a non-JSON body', async () => {
    const f = (async () => new Response('<html>nope</html>', { status: 502 })) as unknown as typeof fetch
    expect(await checkKey('k', f)).toMatchObject({ ok: false, message: 'Google answered 502', hint: null })
  })
  it('reports a network failure as a connection problem', async () => {
    const f = (async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch
    expect(await checkKey('k', f)).toMatchObject({ ok: false, message: "Couldn't reach Google." })
  })
})

describe('hintFor', () => {
  it('maps the common Google messages', () => {
    expect(hintFor('Places API (New) has not been used in project 123 before or it is disabled.')).toMatch(/Enable Places API/)
    expect(hintFor('API key not valid. Please pass a valid API key.')).toMatch(/typed wrong/)
    expect(hintFor('This API project is not authorized to use this API without billing.')).toMatch(/billing/)
    expect(hintFor('Something unknown')).toBeNull()
  })
})
