import type { Highlight } from '../../analytics/highlights'

/** Anything a door opens: the exact range, where the playhead should rest, and the places involved. */
export type OpenDoor = (range: [number, number], playhead?: number, placeIds?: string[]) => void

/** "2 years ago" / "last year" / "earlier this year". */
export function ago(yearsAgo: number): string {
  return yearsAgo <= 0 ? 'earlier this year' : yearsAgo === 1 ? 'last year' : `${yearsAgo} years ago`
}

/** "On this day, 2 years ago — you woke up in Kyoto." */
export function headline(h: Highlight): string {
  return `${h.scope === 'week' ? 'This week' : 'On this day'}, ${ago(h.yearsAgo)} — you ${h.verb} ${h.city}.`
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** "12 Nov 2023" from YYYY-MM-DD. */
export function dmy(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return `${d} ${MON[m - 1]} ${y}`
}
/** "15 November" from YYYY-MM-DD, for copy that names the calendar day. */
export function dayMonth(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${d} ${MONTH[m - 1]}`
}
