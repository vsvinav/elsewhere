const LABEL: Record<string, string> = {
  WALKING: 'Walk', RUNNING: 'Run', CYCLING: 'Cycle', IN_PASSENGER_VEHICLE: 'Car', IN_BUS: 'Bus',
  IN_TRAIN: 'Train', IN_SUBWAY: 'Metro', IN_TRAM: 'Tram', IN_FERRY: 'Ferry', FLYING: 'Flight', MOTORCYCLING: 'Motorbike',
}

/** The one place a mode constant becomes words; anything unknown reads as Other. */
export const modeLabel = (mode: string): string => LABEL[mode] ?? 'Other'
