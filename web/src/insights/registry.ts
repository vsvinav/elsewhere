import type { Insight } from './types'
import { insight as replay } from './replay'

export const insights: Insight[] = [replay]
export const insightById = Object.fromEntries(insights.map((i) => [i.id, i])) as Record<string, Insight>
export const COMING_SOON = ['Wrapped', 'Explore', 'Commute']
