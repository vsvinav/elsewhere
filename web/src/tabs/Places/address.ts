import type { Place } from '../../data/types'

/**
 * The line a person would say for a stop: the first line of the Google Places address plus the city
 * ("1 Devonshire Pl, Boston"), else Nominatim's "street, area", else null for today's text.
 */
export function stopAddress(p: Pick<Place, 'address' | 'city'>, nominatim: string | null | undefined): string | null {
  const first = p.address?.split(',')[0]?.trim() ?? ''
  if (first && first !== p.city) return p.city ? `${first}, ${p.city}` : first
  return nominatim || null
}
