/** Grid clustering in screen space: anything sharing a `cell` px square at this zoom becomes one group. */
export interface Pt { lng: number; lat: number }
export interface Group<T extends Pt> { lng: number; lat: number; items: T[] }

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360)) * (180 / Math.PI)

export function cluster<T extends Pt>(pts: T[], zoom: number, cell = 44): { singles: T[]; groups: Group<T>[] } {
  const scale = (256 * 2 ** zoom) / 360
  const cells = new Map<string, T[]>()
  for (const p of pts) {
    const k = `${Math.floor(((p.lng + 180) * scale) / cell)},${Math.floor(((180 - mercY(p.lat)) * scale) / cell)}`
    const b = cells.get(k); if (b) b.push(p); else cells.set(k, [p])
  }
  const singles: T[] = [], groups: Group<T>[] = []
  for (const items of cells.values()) {
    if (items.length === 1) { singles.push(items[0]); continue }
    groups.push({ lng: items.reduce((a, p) => a + p.lng, 0) / items.length, lat: items.reduce((a, p) => a + p.lat, 0) / items.length, items })
  }
  return { singles, groups }
}
