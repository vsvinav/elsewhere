/** A lens plays one kind of movement only: Play cuts from leg to leg, the map draws only that ink. */
export type Lens = 'all' | 'fly' | 'drive' | 'transit' | 'foot'
export const LENSES: Lens[] = ['all', 'fly', 'drive', 'transit', 'foot']
export const LENS_LABEL: Record<Lens, string> = { all: 'Everything', fly: 'Flights', drive: 'Drives', transit: 'Transit', foot: 'On foot' }

const GROUP: Record<string, Lens> = {
  FLYING: 'fly',
  IN_PASSENGER_VEHICLE: 'drive', MOTORCYCLING: 'drive',
  IN_SUBWAY: 'transit', IN_BUS: 'transit', IN_TRAIN: 'transit', IN_TRAM: 'transit', IN_FERRY: 'transit',
  WALKING: 'foot', CYCLING: 'foot', RUNNING: 'foot',
}
export const lensOf = (mode: string): Lens => GROUP[mode] ?? 'drive'
export const inLens = (mode: string, lens: Lens) => lens === 'all' || lensOf(mode) === lens
