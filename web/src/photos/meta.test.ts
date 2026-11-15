import { FIX_MAX_AGE_MS, photoBarcode, resolveMeta, stampLines, whereLine } from './meta'

// Midday UTC: the same calendar day in every zone a test machine is likely to sit in.
const NOW = Date.UTC(2025, 10, 15, 12, 0, 0)
const place = { id: 'lis-chafariz-xyz', lat: 38.713, lng: -9.131, city: 'Lisbon' }
const fix = { lat: 38.7, lng: -9.1, ts: NOW - 60_000 }
const exif = { lat: 48.86, lng: 2.35, ts: NOW - 86_400_000 }

describe('resolveMeta', () => {
  it('the place the camera opened from wins over everything', () => {
    expect(resolveMeta({ place, fix, exif, now: NOW })).toEqual({ ts: NOW, lat: 38.713, lng: -9.131, placeId: 'lis-chafariz-xyz', city: 'Lisbon' })
  })
  it('a fresh fix beats EXIF', () => {
    expect(resolveMeta({ fix, exif, now: NOW })).toEqual({ ts: NOW, lat: 38.7, lng: -9.1 })
  })
  it('a fix older than ten minutes is ignored', () => {
    const stale = { ...fix, ts: NOW - FIX_MAX_AGE_MS - 1 }
    expect(resolveMeta({ fix: stale, exif, now: NOW })).toEqual({ ts: exif.ts, lat: 48.86, lng: 2.35 })
    expect(resolveMeta({ fix: stale, now: NOW })).toEqual({ ts: NOW })
    expect(resolveMeta({ fix: { ...fix, ts: NOW - FIX_MAX_AGE_MS }, now: NOW })).toEqual({ ts: NOW, lat: 38.7, lng: -9.1 })
  })
  it('EXIF without a timestamp is stamped now', () => {
    expect(resolveMeta({ exif: { lat: 1, lng: 2 }, now: NOW })).toEqual({ ts: NOW, lat: 1, lng: 2 })
  })
  it('nothing known: just the time', () => {
    expect(resolveMeta({ now: NOW })).toEqual({ ts: NOW })
    expect(resolveMeta({ place: null, fix: null, exif: null, now: NOW })).toEqual({ ts: NOW })
  })
})

describe('card text', () => {
  it('stamp lines: city or the brand, the day, month and year', () => {
    expect(stampLines({ ts: NOW, city: 'Lisbon' })).toEqual({ top: 'LISBON', big: '15', bottom: 'NOV 2025' })
    expect(stampLines({ ts: NOW }).top).toBe('ELSEWHERE')
  })
  it('barcode: PHO, the day, six of the place id', () => {
    expect(photoBarcode({ ts: NOW, placeId: 'lis-chafariz-xyz' })).toBe('PHO 20251115 LIS-CH')
    expect(photoBarcode({ ts: NOW })).toBe('PHO 20251115 SOMEWH')
  })
  it('where line: address, else coordinates to 3 dp, else a note', () => {
    expect(whereLine({ lat: 38.7134, lng: -9.1309 }, 'Alfama, Lisboa')).toBe('ALFAMA, LISBOA')
    expect(whereLine({ lat: 38.7134, lng: -9.1309 })).toBe('38.713, -9.131')
    expect(whereLine({})).toBe('NO LOCATION ATTACHED')
  })
})
