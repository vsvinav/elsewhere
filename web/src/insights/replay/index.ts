import type { Insight } from '../types'
import { ReplayPanel } from './Panel'
import { replayLayers } from './layers'

export const insight: Insight = { id: 'replay', label: 'Replay', Panel: ReplayPanel, layers: replayLayers }
