// Friends on the map: a mustard stamp per last fix, and Sonar rings when a hit lands.
import { ScatterplotLayer, TextLayer, type Layer } from 'deck.gl'
import { ageLabel, visibleFixes, type Fix, type Friend, type Hit } from './friends'

export const RING_MS = 1200
type RGBA = [number, number, number, number]
const MUSTARD: RGBA = [233, 181, 49, 255]
const STALE: RGBA = [160, 152, 134, 255]
const INK: RGBA = [20, 20, 20, 255]

export interface FriendDot extends Fix { friend: true; stale: boolean; initial: string; name: string }

let cacheKey: unknown = null
let cacheMinute = 0
let cacheDots: FriendDot[] = []
/** Dots are rebuilt when a ping arrives or the staleness minute ticks, not per frame. */
function dots(fixes: Record<string, Fix>, friends: Friend[], now: number): FriendDot[] {
  const minute = Math.floor(now / 60_000)
  if (fixes === cacheKey && minute === cacheMinute) return cacheDots
  const names = new Map(friends.map((f) => [f.pairId, f.name]))
  cacheDots = visibleFixes(fixes, now).flatMap((f) => {
    const name = names.get(f.pairId)
    return name ? [{ ...f, friend: true as const, initial: (name[0] ?? '?').toUpperCase(), name }] : []
  })
  cacheKey = fixes; cacheMinute = minute
  return cacheDots
}

/** Two ring radii in pixels at progress t∈[0,1]; the second starts a beat later. */
export function ringRadii(t: number): [number, number] {
  return [16 + t * 120, 16 + Math.max(0, t - 0.25) * 120]
}

export function friendLayers(fixes: Record<string, Fix>, friends: Friend[], now: number, hit: Hit | null): Layer[] {
  const data = dots(fixes, friends, now)
  const layers: Layer[] = [
    new ScatterplotLayer<FriendDot>({
      id: 'friends', data, pickable: true, getPosition: (d) => [d.lng, d.lat],
      getRadius: 1, radiusMinPixels: 15, radiusMaxPixels: 15,
      getFillColor: (d) => (d.stale ? STALE : MUSTARD), stroked: true, getLineColor: INK, lineWidthUnits: 'pixels', getLineWidth: 2,
    }),
    new TextLayer<FriendDot>({
      id: 'friend-initials', data, getPosition: (d) => [d.lng, d.lat], getText: (d) => d.initial,
      getColor: INK, getSize: 16, fontFamily: '"Big Shoulders Display", Impact, sans-serif', fontWeight: 900, characterSet: 'auto', fontSettings: { sdf: true, buffer: 3 },
      getTextAnchor: 'middle', getAlignmentBaseline: 'center',
    }),
  ]
  // This browser has no live position of its own, so the rings spread from the friend who pinged.
  const t = hit ? (now - hit.at) / RING_MS : 2
  const centre = hit && t >= 0 && t <= 1 ? data.find((d) => d.pairId === hit.pairId) : undefined
  if (centre) {
    const [r1, r2] = ringRadii(t)
    const alpha = Math.round(255 * (1 - t))
    layers.push(new ScatterplotLayer<{ r: number }>({
      id: 'sonar-rings', data: [{ r: r1 }, { r: r2 }], getPosition: () => [centre.lng, centre.lat],
      radiusUnits: 'pixels', getRadius: (d) => d.r, filled: false, stroked: true, lineWidthUnits: 'pixels', getLineWidth: 3,
      getLineColor: [MUSTARD[0], MUSTARD[1], MUSTARD[2], alpha], updateTriggers: { getRadius: [r1, r2], getLineColor: [alpha] },
    }))
  }
  return layers
}

/** "Marta · Lisbon · 3 min ago", and a second line when you share the city. */
export function tagLine(friend: Friend, fix: Fix, now: number, myCity: string | null): { line: string; both: string | null } {
  const line = [friend.name, fix.city, ageLabel(fix.t, now)].filter(Boolean).join(' · ')
  const both = fix.city && myCity && fix.city.toLowerCase() === myCity.toLowerCase() ? `You're both in ${fix.city}` : null
  return { line, both }
}
