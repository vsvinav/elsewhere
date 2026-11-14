import type { Insight } from '../types'
import { WrappedPanel } from './Panel'
import { wrappedLayers } from './layers'

export const insight: Insight = { id: 'wrapped', label: 'Wrapped', Panel: WrappedPanel, layers: wrappedLayers, fullscreen: true }
