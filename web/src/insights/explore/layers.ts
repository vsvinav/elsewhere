import { ScatterplotLayer, type Layer } from 'deck.gl'
import type { Data } from '../../data/types'
import type { Store } from '../../store/useStore'
import { placeStatuses, type PlaceStatus } from '../../analytics/explore'

type P = ReturnType<typeof placeStatuses>[number]

export const STATUS_COLOR: Record<PlaceStatus, [number, number, number, number]> = {
  new: [94, 234, 212, 240],
  repeat: [148, 163, 184, 150],
  lapsed: [0, 0, 0, 0],
}
const LAPSED_OUTLINE: [number, number, number, number] = [248, 113, 113, 230]

export function exploreLayers(data: Data, state: Store): Layer[] {
  const places = placeStatuses(data, state.timeRange)
  return [
    new ScatterplotLayer<P>({
      id: 'explore-places', data: places, pickable: true,
      getPosition: (d) => [d.lng, d.lat],
      getRadius: (d) => 30 + Math.sqrt(d.n) * 20,
      radiusMinPixels: 4, radiusMaxPixels: 18,
      getFillColor: (d) => STATUS_COLOR[d.status],
      stroked: true, lineWidthMinPixels: 2,
      getLineColor: (d) => (d.status === 'lapsed' ? LAPSED_OUTLINE : [255, 255, 255, 40]),
      updateTriggers: { getFillColor: state.timeRange, getLineColor: state.timeRange },
    }),
  ]
}
