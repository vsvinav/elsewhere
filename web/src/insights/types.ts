import type { Layer } from 'deck.gl'
import type { FC } from 'react'
import type { Data } from '../data/types'
import type { InsightId, Store } from '../store/useStore'

export interface Insight {
  id: InsightId
  label: string
  Panel: FC
  layers(data: Data, state: Store): Layer[]
  fullscreen?: boolean
}
