const B32 = '0123456789bcdefghjkmnpqrstuvwxyz'

/** Geohash encode only; the viewer never needs to decode a friend's cell. */
export function geohash(lat: number, lng: number, precision: number): string {
  let out = '', bits = 0, ch = 0, even = true
  let latLo = -90, latHi = 90, lngLo = -180, lngHi = 180
  while (out.length < precision) {
    if (even) { const mid = (lngLo + lngHi) / 2; if (lng >= mid) { ch = (ch << 1) | 1; lngLo = mid } else { ch <<= 1; lngHi = mid } }
    else { const mid = (latLo + latHi) / 2; if (lat >= mid) { ch = (ch << 1) | 1; latLo = mid } else { ch <<= 1; latHi = mid } }
    even = !even
    if (++bits === 5) { out += B32[ch]; bits = 0; ch = 0 }
  }
  return out
}
/** Centre of the geohash cell holding the point, found by the same bisection. */
export function cellCentre(lat: number, lng: number, precision: number): { lat: number; lng: number } {
  let bits = 0, even = true
  let latLo = -90, latHi = 90, lngLo = -180, lngHi = 180
  while (bits < precision * 5) {
    if (even) { const mid = (lngLo + lngHi) / 2; if (lng >= mid) lngLo = mid; else lngHi = mid }
    else { const mid = (latLo + latHi) / 2; if (lat >= mid) latLo = mid; else latHi = mid }
    even = !even; bits++
  }
  return { lat: (latLo + latHi) / 2, lng: (lngLo + lngHi) / 2 }
}
