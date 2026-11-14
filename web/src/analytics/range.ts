import type { Activity, Visit } from '../data/types'

export function inRange<T extends { start: number; end: number }>(rows: T[], range: [number, number]): T[] {
  const [a, b] = range
  return rows.filter((r) => r.end >= a && r.start <= b)
}

export function kmByMode(activities: Activity[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const a of activities) out[a.mode] = (out[a.mode] ?? 0) + a.m / 1000
  return out
}

export function distinctPlaces(visits: Visit[]): number {
  return new Set(visits.map((v) => v.place_id)).size
}
