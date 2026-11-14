import type { Map as LibreMap } from 'maplibre-gl'

/** The few camera calls the follow-cam and deck need, so they run on Google or MapLibre alike. Zooms use Google's 256px convention. */
export interface Cam {
  div: HTMLElement
  zoom(): number
  center(): { lng: number; lat: number }
  move(c: { lng: number; lat: number }, zoom: number): void
  fit(sw: [number, number], ne: [number, number], pad: { top: number; bottom: number; left: number; right: number }): void
  on(ev: 'zoom' | 'dragstart' | 'idle', f: () => void): () => void
}

export const googleCam = (m: google.maps.Map): Cam => ({
  div: m.getDiv(),
  zoom: () => m.getZoom() ?? 10,
  center: () => { const c = m.getCenter(); return { lng: c?.lng() ?? 0, lat: c?.lat() ?? 0 } },
  move: (c, zoom) => m.moveCamera({ center: c, zoom }),
  fit: (sw, ne, pad) => m.fitBounds(new google.maps.LatLngBounds({ lng: sw[0], lat: sw[1] }, { lng: ne[0], lat: ne[1] }), pad),
  on: (ev, f) => { const l = m.addListener(ev === 'zoom' ? 'zoom_changed' : ev, f); return () => l.remove() },
})

// MapLibre's zoom 0 is a 512px world; Google's is 256px, so the same view is one level apart.
export const libreCam = (m: LibreMap): Cam => ({
  div: m.getContainer(),
  zoom: () => m.getZoom() + 1,
  center: () => m.getCenter(),
  move: (c, zoom) => m.jumpTo({ center: c, zoom: zoom - 1 }),
  fit: (sw, ne, pad) => m.fitBounds([sw, ne], { padding: pad, duration: 0 }),
  on: (ev, f) => { const e = ev === 'zoom' ? 'zoom' : ev === 'idle' ? 'moveend' : 'dragstart'; m.on(e, f); return () => { m.off(e, f) } },
})
