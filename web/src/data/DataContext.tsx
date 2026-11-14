import { createContext, useContext, useMemo } from 'react'
import type { Data } from '../data/types'
import { useStore } from '../store/useStore'
import { filterData } from './filter'

export const DataContext = createContext<Data | null>(null)

/** The whole record as loaded, regardless of the date filter. */
export function useRawData(): Data {
  const d = useContext(DataContext)
  if (!d) throw new Error('DataContext missing')
  return d
}

/** The record cut to the active date range; every tab reads this. */
export function useData(): Data {
  const raw = useRawData()
  const range = useStore((s) => s.range)
  return useMemo(() => (range ? filterData(raw, range) : raw), [raw, range])
}
