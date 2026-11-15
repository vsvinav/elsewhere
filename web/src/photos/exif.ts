// A tiny EXIF reader for one thing: the GPS position (and the date) of a JPEG picked from the gallery.
import type { Exif } from './meta'

const GPS_IFD = 0x8825, EXIF_IFD = 0x8769, DATE_ORIGINAL = 0x9003
const GPS_LAT_REF = 1, GPS_LAT = 2, GPS_LNG_REF = 3, GPS_LNG = 4

/** The GPS position and original date from the JPEG's APP1 segment, or null when the file has neither. */
export async function readExif(file: Blob): Promise<Exif | null> {
  // 256 KB is well beyond where APP1 sits in any JPEG; the rest of the file is picture.
  const buf = await file.slice(0, 256 * 1024).arrayBuffer()
  const v = new DataView(buf)
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null
  let p = 2
  while (p + 4 <= v.byteLength) {
    const marker = v.getUint16(p), len = v.getUint16(p + 2)
    if (marker === 0xffe1 && p + 10 <= v.byteLength && v.getUint32(p + 4) === 0x45786966) return parseTiff(new DataView(buf, p + 10, Math.min(len - 8, v.byteLength - p - 10)))
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null
    p += 2 + len
  }
  return null
}

function parseTiff(t: DataView): Exif | null {
  if (t.byteLength < 8) return null
  const le = t.getUint16(0) === 0x4949
  const u16 = (o: number) => t.getUint16(o, le), u32 = (o: number) => t.getUint32(o, le)
  const ifd0 = u32(4)
  let gps = 0, exif = 0
  for (const [tag, at] of entries(t, ifd0, le)) { if (tag === GPS_IFD) gps = u32(at + 8); if (tag === EXIF_IFD) exif = u32(at + 8) }
  let ts: number | undefined
  if (exif) for (const [tag, at] of entries(t, exif, le)) if (tag === DATE_ORIGINAL) ts = parseDate(ascii(t, at, le))
  if (!gps) return null
  let lat: number | undefined, lng: number | undefined, latRef = 'N', lngRef = 'E'
  for (const [tag, at] of entries(t, gps, le)) {
    if (tag === GPS_LAT_REF) latRef = String.fromCharCode(t.getUint8(at + 8))
    if (tag === GPS_LNG_REF) lngRef = String.fromCharCode(t.getUint8(at + 8))
    if (tag === GPS_LAT || tag === GPS_LNG) {
      const o = u32(at + 8)
      if (o + 24 > t.byteLength) continue
      const dms = [0, 1, 2].map((i) => { const d = u32(o + i * 8 + 4); return d ? u32(o + i * 8) / d : 0 })
      const deg = dms[0] + dms[1] / 60 + dms[2] / 3600
      if (tag === GPS_LAT) lat = deg; else lng = deg
    }
  }
  if (lat == null || lng == null) return null
  if (latRef === 'S') lat = -lat
  if (lngRef === 'W') lng = -lng
  return ts != null ? { lat, lng, ts } : { lat, lng }
  function ascii(v: DataView, at: number, le: boolean): string {
    const n = v.getUint32(at + 4, le), o = n > 4 ? v.getUint32(at + 8, le) : at + 8
    let s = ''
    for (let i = 0; i < n && o + i < v.byteLength; i++) { const c = v.getUint8(o + i); if (c) s += String.fromCharCode(c) }
    return s
  }
}

/** Every (tag, offset-of-entry) in one IFD; stops at anything that runs off the segment. */
function* entries(t: DataView, ifd: number, le: boolean): Generator<[number, number]> {
  if (ifd + 2 > t.byteLength) return
  const n = t.getUint16(ifd, le)
  for (let i = 0; i < n; i++) { const at = ifd + 2 + i * 12; if (at + 12 > t.byteLength) return; yield [t.getUint16(at, le), at] }
}

/** EXIF's `YYYY:MM:DD HH:MM:SS` as local time, like the camera's clock. */
function parseDate(s: string): number | undefined {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s)
  if (!m) return undefined
  const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime()
  return Number.isFinite(t) ? t : undefined
}
