import { ArcLayer, ScatterplotLayer, type Layer } from 'deck.gl'
import type { Data } from '../../data/types'
import type { Store } from '../../store/useStore'
import { wrappedFacts } from '../../analytics/wrapped'
import { useWrapped } from './state'

const ACCENT: [number, number, number, number] = [94, 234, 212, 220]
const PINK: [number, number, number, number] = [244, 114, 182, 200]

let memo: { key: string; cards: ReturnType<typeof wrappedFacts> } | null = null
export function cardsFor(data: Data, range: [number, number]) {
  const key = `${range[0]}-${range[1]}`
  if (memo?.key !== key) memo = { key, cards: wrappedFacts(data, range) }
  return memo.cards
}

export function wrappedLayers(data: Data, state: Store): Layer[] {
  const cards = cardsFor(data, state.timeRange)
  const card = cards[Math.min(useWrapped.getState().index, cards.length - 1)]
  if (!card) return []
  const layers: Layer[] = []
  if (card.points?.length) {
    layers.push(new ScatterplotLayer({
      id: 'wrapped-points', data: card.points, getPosition: (d: [number, number]) => d,
      getFillColor: ACCENT, radiusMinPixels: 4, radiusMaxPixels: 10, getRadius: 40, stroked: true,
      getLineColor: [255, 255, 255, 120], lineWidthMinPixels: 1,
    }))
  }
  if (card.arcs?.length) {
    layers.push(new ArcLayer({
      id: 'wrapped-arcs', data: card.arcs, getSourcePosition: (d) => d.s, getTargetPosition: (d) => d.e,
      getSourceColor: PINK, getTargetColor: ACCENT, getWidth: 2, greatCircle: true,
    }))
  }
  return layers
}
