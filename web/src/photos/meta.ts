// Where and when a photo was taken, settled from what we know. Pure; the Android half is photos/Meta.kt.

/** A fix from the phone counts only while it is this fresh. */
export const FIX_MAX_AGE_MS = 10 * 60 * 1000

export interface PlaceCtx { id: string; lat: number; lng: number; city?: string | null }
export interface Fix { lat: number; lng: number; ts: number }
export interface Exif { lat: number; lng: number; ts?: number }
export interface PhotoMeta { ts: number; lat?: number; lng?: number; placeId?: string; city?: string }

/**
 * Order of truth: the place the camera was opened from, a recent fix, the picture's own EXIF, nothing.
 * The time is `now`, except for a gallery picture placed by its EXIF, which keeps the moment it was taken.
 */
export function resolveMeta({ place, fix, exif, now }: { place?: PlaceCtx | null; fix?: Fix | null; exif?: Exif | null; now: number }): PhotoMeta {
  if (place) return { ts: now, lat: place.lat, lng: place.lng, placeId: place.id, ...(place.city ? { city: place.city } : {}) }
  if (fix && now - fix.ts >= 0 && now - fix.ts <= FIX_MAX_AGE_MS) return { ts: now, lat: fix.lat, lng: fix.lng }
  if (exif) return { ts: exif.ts ?? now, lat: exif.lat, lng: exif.lng }
  return { ts: now }
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** The round stamp's three lines: city or the brand, the day, month and year. Local time, like the phone's clock. */
export function stampLines(m: { ts: number; city?: string }): { top: string; big: string; bottom: string } {
  const d = new Date(m.ts)
  return { top: (m.city ?? 'ELSEWHERE').toUpperCase(), big: String(d.getDate()), bottom: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` }
}

/** `PHO 20251115 LISCHA`: the day and the first six of the place id, or a blank run when there is no place. */
export function photoBarcode(m: { ts: number; placeId?: string }): string {
  const d = new Date(m.ts)
  const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `PHO ${day} ${(m.placeId ?? 'SOMEWH').slice(0, 6).toUpperCase()}`
}

/** The line under the name: the address, else the coordinates to three places, else a note that nothing was attached. */
export function whereLine(m: { lat?: number; lng?: number }, address?: string | null): string {
  if (address) return address.toUpperCase()
  if (m.lat != null && m.lng != null) return `${m.lat.toFixed(3)}, ${m.lng.toFixed(3)}`
  return 'NO LOCATION ATTACHED'
}

export const CAPTION_MAX = 80
export const PRIVACY_COPY = 'Photos stay on this device. The card you share is a picture with the place name and date on it — no GPS is attached. Delete any photo from its card; "Start over" removes them all.'
