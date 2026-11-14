import { useEffect, useState } from 'react'
import { kv } from './db'

/**
 * Street addresses from OpenStreetMap's Nominatim: free, no key, one request a second by its usage policy.
 * Used for the few places where a house number beats a business name (home and work candidates).
 */
const KEY = 'addr'
const GAP_MS = 1100
let cache: Promise<Record<string, string | null>> | null = null
let chain: Promise<unknown> = Promise.resolve()

const keyOf = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`
type Book = Record<string, string | null>
const load = () => (cache ??= kv.get<Book>(KEY).then((c): Book => c ?? {}).catch((): Book => ({})))

interface Addr { house_number?: string; road?: string; neighbourhood?: string; suburb?: string; city?: string; town?: string; village?: string }
/** "2180 Cranston Rd, University Heights" — the bits a person would say. */
export function shortAddress(a: Addr): string | null {
  const street = [a.house_number, a.road].filter(Boolean).join(' ')
  const area = a.neighbourhood ?? a.suburb ?? a.city ?? a.town ?? a.village
  return street ? (area ? `${street}, ${area}` : street) : null
}

async function fetchOne(lat: number, lng: number): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${lat}&lon=${lng}`
  const res = await fetch(url, { headers: { Accept: 'application/json', 'Accept-Language': 'en' } })
  if (!res.ok) throw new Error(`Nominatim ${res.status}`)
  const body = await res.json() as { address?: Addr }
  return body.address ? shortAddress(body.address) : null
}

/** Address for a point, from cache or the queue. Resolves null when OSM has nothing usable. */
export function address(lat: number, lng: number): Promise<string | null> {
  const k = keyOf(lat, lng)
  return load().then((c) => {
    if (k in c) return c[k]
    const p = chain.then(async () => {
      if (k in c) return c[k]
      const a = await fetchOne(lat, lng).catch(() => null)
      c[k] = a
      kv.set(KEY, c).catch(() => undefined)
      await new Promise((r) => setTimeout(r, GAP_MS))
      return a
    })
    chain = p
    return p
  })
}

/** Address for a point as it lands; undefined while loading. */
export function useAddress(lat: number, lng: number): string | null | undefined {
  const k = keyOf(lat, lng)
  const [a, setA] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    setA(undefined)
    address(lat, lng).then((v) => { if (live) setA(v) })
    return () => { live = false }
  }, [k, lat, lng])
  return a
}

