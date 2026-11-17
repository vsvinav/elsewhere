import { describe, expect, it } from 'vitest'
import { b64, unb64 } from '../crew/keys'
import { chunkKey, importSource, monthOf, openBlob, openVault2Text, sealBlob, sealVault2, stayId, SYNC_KEY_RE } from './wire'

const KEY = Uint8Array.from({ length: 32 }, (_, i) => i)
const NONCE = Uint8Array.from({ length: 12 }, (_, i) => i)

describe('wire', () => {
  it('seals the pinned vector byte for byte', () => {
    const plain = { v: 1, stays: [{ id: 'ab', lat: 1.5, lng: -2.25, name: 'Café', start: 1700000000, end: 1700003600 }] }
    const blob = sealBlob(KEY, 'i_ab12cd34ef56:2023-11', plain, 1700000000000, NONCE)
    expect(blob).toEqual({ v: 1, ts: 1700000000000, nonce: 'AAECAwQFBgcICQoL', ct: expect.any(String) })
    expect(blob.ct).toMatchInlineSnapshot(`"8tl+IhMmiWLE916K6z80OLJS24NzTo/YhLUD5xmh0h7WsQLGyjzd9lAQTPVXur0WUqbHFZBNmqEw+7hhU+a8+lsLyKyXYA7T9SF9jChM7MHq7msQCgSUHDRmxz7oTTKMe+5cjqqkgX8d93Rpevk8oDnohku4ZQ=="`)
    expect(openBlob(KEY, 'i_ab12cd34ef56:2023-11', blob)).toEqual(plain)
    expect(() => openBlob(KEY, 'profile', blob)).toThrow()
    expect(() => openBlob(Uint8Array.from(KEY, (b) => b ^ 1), 'i_ab12cd34ef56:2023-11', blob)).toThrow()
  })
  it('seals the vault under the Drive key with the pinned vector', () => {
    const plain = { v: 1 as const, signPriv: '00', kxPriv: '11', profile: { name: null, units: 'km' as const, homes: [], works: [] }, settings: { units: 'km' as const, relayUrl: '' } }
    const body = sealVault2(KEY, plain, NONCE)
    expect(body.v).toBe(2)
    expect(body.iv).toBe('AAECAwQFBgcICQoL')
    expect(body.ct).toMatchInlineSnapshot(`"8tl+IhMmiWLE6lidyG9nFetKkNdhVoGbje9/txy2hAbOsR3RyjzB6lhUH7QAtrVYXOrIGZgKgvVn1LUrsjrwvw0LnvfHf0HL6DQl03UZr9PghRoeTR2fTGUk0jSDIH+Tb60Jh4OwSZPCecnMgOTZ6Z0cdAKrNi3aY09GuhVexhPTCuGHixGiEZM9PV38sdi376aZZlJfxhc="`)
    expect(JSON.parse(openVault2Text(KEY, body))).toEqual(plain)
    expect(unb64(body.ct).length).toBe(JSON.stringify(plain).length + 16)
    expect(b64(NONCE)).toBe(body.iv)
  })
  it('buckets by UTC month across a year boundary and names stays and sources', () => {
    expect(monthOf(Date.UTC(2025, 11, 31, 23, 59, 59) / 1000)).toBe('2025-12')
    expect(monthOf(Date.UTC(2026, 0, 1, 0, 0, 0) / 1000)).toBe('2026-01')
    expect(stayId('i_ab12cd34ef56', 1700000000)).toMatchInlineSnapshot(`"8879991759aa282c25416e9018227a8b2739ff579e1322baebf4a281be245a8b"`)
    expect(importSource('ab12cd34ef56789abcdef0123456789abcdef0123456789abcdef0123456789a')).toBe('i_ab12cd34ef56')
    expect(chunkKey('i_ab12cd34ef56', '2026-01')).toBe('i_ab12cd34ef56:2026-01')
    for (const k of ['i_ab12cd34ef56:2026-01', 'd_phone1:2025-12', 'profile']) expect(SYNC_KEY_RE.test(k), k).toBe(true)
    for (const k of ['Profile', 'i_:2026-01', 'i_abc:2026-1', 'vault']) expect(SYNC_KEY_RE.test(k), k).toBe(false)
  })
})
