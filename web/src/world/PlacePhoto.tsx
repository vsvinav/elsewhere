import type { Place } from '../data/types'
import { categoryOf, type Cat } from '../analytics/category'
import { useCommonsPhoto } from '../ingest/wikimedia'
import { Photo } from '../usage/Meter'

/** Kinds of place a geotagged Commons photo tends to actually show. */
const FREE_FIRST = new Set<Cat>(['culture', 'transit', 'stay'])

/**
 * The picture for a place. Landmarks, stations and hotels try Wikimedia Commons first (free) and only
 * fall back to the Google photo; everything else uses the Google photo when there is one. Renders nothing
 * when neither has a picture.
 */
export function PlacePhoto({ place, lazy = true, className }: { place: Place | undefined; lazy?: boolean; className?: string }) {
  const free = !!place && FREE_FIRST.has(categoryOf(place))
  const wiki = useCommonsPhoto(place?.lat ?? 0, place?.lng ?? 0, free)
  if (!place) return null
  if (free && wiki === undefined && !place.photo) return null
  const src = (free && wiki) || place.photo
  if (!src) return null
  return src === place.photo ? <Photo src={src} lazy={lazy} className={className} /> : <img className={className ?? 'photo'} src={src} alt="" loading={lazy ? 'lazy' : undefined} />
}
