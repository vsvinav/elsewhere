import { useProfile } from './profile'

export type Units = 'km' | 'mi'
export const MI = 1 / 1.609344

/** The visitor's distance unit and a converter from the record's kilometres. */
export function useUnits() {
  const u: Units = useProfile()?.units ?? 'km'
  const cv = (km: number) => (u === 'mi' ? km * MI : km)
  return { u, cv, U: u.toUpperCase() }
}
