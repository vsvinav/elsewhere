import { useEffect, useState } from 'react'
import { kv } from './db'

/**
 * Photos from Wikimedia Commons, free and keyless: the nearest geotagged picture within a short walk.
 * Good for landmarks, stations and hotels; useless for a taco place, which is why callers pick the category.
 */
const KEY = 'wiki'
const RADIUS_M = 120
const GAP_MS = 150
type Book = Record<string, string | null>
let cache: Promise<Book> | null = null
let chain: Promise<unknown> = Promise.resolve()
const load = () => (cache ??= kv.get<Book>(KEY).then((c): Book => c ?? {}).catch((): Book => ({})))
const keyOf = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`

interface Page { imageinfo?: { thumburl?: string; url?: string }[]; title?: string }
/** The first picture that is a photo, not a map, plan or flag. */
export function pickPhoto(pages: Page[]): string | null {
  for (const p of pages) {
    if (/map|plan|logo|flag|diagram|\.svg$|\.pdf$/i.test(p.title ?? '')) continue
    const u = p.imageinfo?.[0]?.thumburl ?? p.imageinfo?.[0]?.url
    if (u) return u
  }
  return null
}

async function fetchOne(lat: number, lng: number): Promise<string | null> {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=geosearch&ggscoord=${lat}|${lng}&ggsradius=${RADIUS_M}&ggsnamespace=6&ggslimit=5&prop=imageinfo&iiprop=url&iiurlwidth=900&format=json&origin=*`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Commons ${res.status}`)
  const body = await res.json() as { query?: { pages?: Record<string, Page> } }
  return pickPhoto(Object.values(body.query?.pages ?? {}))
}

/** Commons photo near a point, from cache or the queue; null when there is none. */
export function commonsPhoto(lat: number, lng: number): Promise<string | null> {
  const k = keyOf(lat, lng)
  return load().then((c) => {
    if (k in c) return c[k]
    const p = chain.then(async () => {
      if (k in c) return c[k]
      const u = await fetchOne(lat, lng).catch(() => null)
      c[k] = u
      kv.set(KEY, c).catch(() => undefined)
      await new Promise((r) => setTimeout(r, GAP_MS))
      return u
    })
    chain = p
    return p
  })
}

/** Commons photo as it lands; undefined while loading, null when none. Off when `on` is false. */
export function useCommonsPhoto(lat: number, lng: number, on: boolean): string | null | undefined {
  const [u, setU] = useState<string | null | undefined>(on ? undefined : null)
  useEffect(() => {
    if (!on) { setU(null); return }
    let live = true
    setU(undefined)
    commonsPhoto(lat, lng).then((v) => { if (live) setU(v) })
    return () => { live = false }
  }, [lat, lng, on])
  return u
}
