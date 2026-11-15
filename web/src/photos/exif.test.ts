import { readExif } from './exif'

/** A JPEG header with one APP1 segment: IFD0 → GPS IFD (lat/lng as rationals) and EXIF IFD (DateTimeOriginal). Big-endian. */
function jpegWithGps(lat: [number, number, number], latRef: string, lng: [number, number, number], lngRef: string, date?: string): Blob {
  const tiff: number[] = []
  const u16 = (n: number) => tiff.push((n >> 8) & 255, n & 255)
  const u32 = (n: number) => { u16((n >>> 16) & 0xffff); u16(n & 0xffff) }
  const entry = (tag: number, type: number, count: number, value: number, ascii?: string) => {
    u16(tag); u16(type); u32(count)
    if (ascii) { for (const c of ascii.padEnd(4, '\0').slice(0, 4)) tiff.push(c.charCodeAt(0)) } else u32(value)
  }
  tiff.push(0x4d, 0x4d); u16(42); u32(8)
  // IFD0 at 8: two entries (GPS pointer, EXIF pointer) → 2 + 24 + 4 = 30 bytes; GPS IFD at 38.
  u16(2); entry(0x8825, 4, 1, 38); entry(0x8769, 4, 1, 38 + 2 + 4 * 12 + 4 + 48); u32(0)
  // GPS IFD at 38: 4 entries → 2 + 48 + 4 = 54; rationals start at 92 (lat), 116 (lng).
  u16(4); entry(1, 2, 2, 0, latRef); entry(2, 5, 3, 92); entry(3, 2, 2, 0, lngRef); entry(4, 5, 3, 116); u32(0)
  for (const v of [...lat, ...lng]) { u32(v); u32(1) }
  // EXIF IFD at 140: one entry, the ASCII date lives at 140 + 2 + 12 + 4 = 158.
  u16(1); entry(0x9003, 2, date ? date.length + 1 : 0, 158); u32(0)
  if (date) for (const c of date + '\0') tiff.push(c.charCodeAt(0))
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
  const len = app1.length + 2
  return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe1, (len >> 8) & 255, len & 255, ...app1, 0xff, 0xd9])])
}

describe('readExif', () => {
  it('reads GPS degrees, minutes, seconds with hemisphere signs, and the original date', async () => {
    const r = await readExif(jpegWithGps([38, 42, 48], 'N', [9, 7, 48], 'W', '2025:11:15 14:02:00'))
    expect(r).not.toBeNull()
    expect(r!.lat).toBeCloseTo(38.7133, 3)
    expect(r!.lng).toBeCloseTo(-9.13, 3)
    expect(r!.ts).toBe(new Date(2025, 10, 15, 14, 2, 0).getTime())
  })
  it('southern and eastern hemispheres, no date', async () => {
    const r = await readExif(jpegWithGps([33, 52, 0], 'S', [151, 12, 0], 'E'))
    expect(r!.lat).toBeCloseTo(-33.8667, 3)
    expect(r!.lng).toBeCloseTo(151.2, 3)
    expect(r!.ts).toBeUndefined()
  })
  it('a JPEG without APP1, or a non-JPEG, has no position', async () => {
    expect(await readExif(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])]))).toBeNull()
    expect(await readExif(new Blob(['PNG'.repeat(10)]))).toBeNull()
  })
})
