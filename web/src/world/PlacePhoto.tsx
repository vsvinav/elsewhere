import type { Place } from '../data/types'
import { categoryOf, type Cat } from '../analytics/category'
import { useCommonsPhoto } from '../ingest/wikimedia'
import { Photo } from '../usage/Meter'

/** Kinds of place a geotagged Commons photo tends to actually show. */
const FREE_FIRST = new Set<Cat>(['culture', 'transit', 'stay'])

/**
 * The picture for a place: the Google photo when there is one; otherwise, for landmarks, stations and
 * hotels, a free geotagged Wikimedia Commons photo. Renders nothing when neither has a picture.
 */
export function PlacePhoto({ place, lazy = true, className }: { place: Place | undefined; lazy?: boolean; className?: string }) {
  const free = !!place && !place.photo && FREE_FIRST.has(categoryOf(place))
  const wiki = useCommonsPhoto(place?.lat ?? 0, place?.lng ?? 0, free)
  if (!place) return null
  if (place.photo) return <Photo src={place.photo} lazy={lazy} className={className} />
  if (!wiki) return null
  return <img className={className ?? 'photo'} src={wiki} alt="" loading={lazy ? 'lazy' : undefined} />
}
