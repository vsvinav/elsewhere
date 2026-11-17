const LABEL: Record<string, string> = {
  WALKING: 'Walk', RUNNING: 'Run', CYCLING: 'Cycle', IN_PASSENGER_VEHICLE: 'Car', IN_BUS: 'Bus',
  IN_TRAIN: 'Train', IN_SUBWAY: 'Metro', IN_TRAM: 'Tram', IN_FERRY: 'Ferry', FLYING: 'Flight', MOTORCYCLING: 'Motorbike',
}

/** The one place a mode constant becomes words; anything unknown reads as Other. */
export const modeLabel = (mode: string): string => LABEL[mode] ?? 'Other'

/** Km keyed by raw mode, folded onto labels so every unnamed mode shares one Other row; biggest first. */
export function kmByLabel(km: Record<string, number>): [string, number][] {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(km)) { const l = modeLabel(k); out[l] = (out[l] ?? 0) + v }
  return Object.entries(out).sort((a, b) => b[1] - a[1])
}
