import { PathLayer, type Layer } from 'deck.gl'
import type { Data } from '../../data/types'
import type { Store } from '../../store/useStore'
import { commuteStats, type Leg } from '../../analytics/commute'

let memo: { key: string; stats: ReturnType<typeof commuteStats> } | null = null
export function statsFor(data: Data, range: [number, number]) {
  const key = `${range[0]}-${range[1]}`
  if (memo?.key !== key) memo = { key, stats: commuteStats(data, range) }
  return memo.stats
}

/** Green = quicker than your median, red = slower. */
export function legColor(minutes: number, median: number): [number, number, number, number] {
  const r = median ? minutes / median : 1
  if (r < 0.85) return [94, 234, 212, 160]
  if (r > 1.3) return [248, 113, 113, 170]
  return [226, 232, 240, 110]
}

export function commuteLayers(data: Data, state: Store): Layer[] {
  const s = statsFor(data, state.timeRange)
  return [
    new PathLayer<Leg>({
      id: 'commute-legs', data: s.legs, pickable: false,
      getPath: (d) => d.path, getColor: (d) => legColor(d.minutes, s.median_all),
      getWidth: 3, widthMinPixels: 2, widthMaxPixels: 6, jointRounded: true, capRounded: true,
    }),
  ]
}
