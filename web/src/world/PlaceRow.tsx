import type { ReactNode } from 'react'
import type { Place } from '../data/types'
import { need } from '../ingest/places'
import { useInView } from './useInView'

/** A list row that asks for its place's name and photo once it scrolls into view. */
export function PlaceRow({ id, places, children, className }: { id: string; places: Record<string, Place>; children: ReactNode; className?: string }) {
  const ref = useInView<HTMLLIElement>(() => need([id], places))
  return <li ref={ref} className={className}>{children}</li>
}
