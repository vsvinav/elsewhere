import { describe, expect, it } from 'vitest'
import { CODE_TTL_MS, bucketOf, expiresIn, formatCode, isExpired, newCode, parseCode } from './codes'

describe('share codes', () => {
  it('newCode is PT-XXX-XXXX from the Crockford alphabet', () => {
    for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^PT-[0-9A-HJKMNP-TV-Z]{3}-[0-9A-HJKMNP-TV-Z]{4}$/)
  })
  it('parse accepts loose typing and returns the canonical form', () => {
    expect(parseCode('pt-ksv-7q4k')).toBe('PT-KSV-7Q4K')
    expect(parseCode('  PT KSV 7Q4K ')).toBe('PT-KSV-7Q4K')
    expect(parseCode('KSV7Q4K')).toBe('PT-KSV-7Q4K')
    expect(parseCode('elsewhere://pair/PT-KSV-7Q4K')).toBe('PT-KSV-7Q4K')
  })
  it('parse rejects wrong lengths and excluded letters', () => {
    expect(parseCode('PT-KSV-7Q4')).toBeNull()
    expect(parseCode('PT-KSO-7Q4K')).toBeNull()
    expect(parseCode('PT-LIS-7Q4K')).toBeNull()
    expect(parseCode('PT-KSV-7U4K')).toBeNull()
    expect(parseCode('')).toBeNull()
  })
  it('bucket is the first three, formatCode regroups', () => {
    expect(bucketOf('PT-KSV-7Q4K')).toBe('KSV')
    expect(formatCode('KSV7Q4K')).toBe('PT-KSV-7Q4K')
  })
  it('a code lasts 24 h', () => {
    const made = 1_000_000
    expect(CODE_TTL_MS).toBe(24 * 3600 * 1000)
    expect(isExpired(made, made + CODE_TTL_MS - 1)).toBe(false)
    expect(isExpired(made, made + CODE_TTL_MS)).toBe(true)
    expect(expiresIn(made, made + 3600 * 1000)).toBe('23 h')
    expect(expiresIn(made, made + CODE_TTL_MS - 30 * 60 * 1000)).toBe('30 min')
    expect(expiresIn(made, made + CODE_TTL_MS + 1)).toBe('expired')
  })
})
