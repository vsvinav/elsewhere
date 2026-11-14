import { createContext, useContext } from 'react'
import type { Data } from './types'

export const DataContext = createContext<Data | null>(null)

export function useData(): Data {
  const d = useContext(DataContext)
  if (!d) throw new Error('DataContext missing')
  return d
}
