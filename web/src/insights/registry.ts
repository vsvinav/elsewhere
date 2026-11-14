import type { Insight } from './types'
import { insight as replay } from './replay'
import { insight as wrapped } from './wrapped'
import { insight as explore } from './explore'
import { insight as commute } from './commute'

export const insights: Insight[] = [replay, wrapped, explore, commute]
export const insightById = Object.fromEntries(insights.map((i) => [i.id, i])) as Record<string, Insight>
