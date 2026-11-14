import type { Insight } from '../types'
import { ExplorePanel } from './Panel'
import { exploreLayers } from './layers'

export const insight: Insight = { id: 'explore', label: 'Explore', Panel: ExplorePanel, layers: exploreLayers }
