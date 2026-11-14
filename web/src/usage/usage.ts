import { useSyncExternalStore } from 'react'

/** Rough tally of billable Google calls made from this browser, so a key owner can see what the app costs. */
export type Kind = 'details' | 'photos' | 'maps'
export interface Usage { details: number; photos: number; maps: number; since: number }

/** USD per 1,000 calls at list price, before Google's monthly free allowance. */
export const RATE: Record<Kind, number> = { details: 17, photos: 7, maps: 7 }
export const LABEL: Record<Kind, string> = { details: 'Place lookups', photos: 'Place photos', maps: 'Map loads' }

const LS = 'elsewhere.usage'
const store = typeof localStorage === 'undefined' ? null : localStorage
const fresh = (): Usage => ({ details: 0, photos: 0, maps: 0, since: Date.now() })
const read = (): Usage => { try { return { ...fresh(), ...JSON.parse(store?.getItem(LS) ?? '{}') } } catch { return fresh() } }
let cur: Usage = read()
const subs = new Set<() => void>()
const write = (u: Usage) => { cur = u; try { store?.setItem(LS, JSON.stringify(u)) } catch { /* private mode */ } subs.forEach((f) => f()) }

export const tally = (k: Kind, n = 1) => write({ ...cur, [k]: cur[k] + n })
export const resetUsage = () => write(fresh())
export const getUsage = () => cur
export const dollars = (u: Usage) => (u.details * RATE.details + u.photos * RATE.photos + u.maps * RATE.maps) / 1000
export const useUsage = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => cur)
