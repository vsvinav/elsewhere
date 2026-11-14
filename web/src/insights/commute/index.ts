import type { Insight } from '../types'
import { CommutePanel } from './Panel'
import { commuteLayers } from './layers'

export const insight: Insight = { id: 'commute', label: 'Commute', Panel: CommutePanel, layers: commuteLayers }
