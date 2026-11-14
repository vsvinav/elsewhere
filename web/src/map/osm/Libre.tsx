import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Map as Libre } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

/** Free vector basemap in quiet greys (OpenFreeMap's Positron, OpenStreetMap data); no key, no bill. */
const STYLE = 'https://tiles.openfreemap.org/styles/positron'

const Ctx = createContext<Libre | null>(null)
export const useLibre = () => useContext(Ctx)

export function LibreMap({ center, zoom, interactive = true, children }: { center: { lng: number; lat: number }; zoom: number; interactive?: boolean; children?: ReactNode }) {
  const div = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<Libre | null>(null)
  useEffect(() => {
    if (!div.current) return
    const m = new Libre({ container: div.current, style: STYLE, center, zoom: zoom - 1, interactive, attributionControl: { compact: true }, fadeDuration: 0 })
    m.once('load', () => setMap(m))
    return () => { setMap(null); m.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { if (map && !interactive) map.jumpTo({ center, zoom: zoom - 1 }) }, [map, center, zoom, interactive])
  return <div ref={div} className="libre" style={{ position: 'absolute', inset: 0 }}><Ctx.Provider value={map}>{children}</Ctx.Provider></div>
}
