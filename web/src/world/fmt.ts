import { MODE_LABEL } from '../analytics/format'

export const n0 = (x: number) => Math.round(x).toLocaleString('en-US')
export const date = (ts: number) => new Date(ts * 1000).toLocaleDateString('en-US', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
export const dateISO = (s: string) => date(Date.parse(s + 'T00:00:00Z') / 1000)
export const month = (key: string) => new Date(key + '-01T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', year: '2-digit' }).toUpperCase()
export const label = (mode: string) => MODE_LABEL[mode] ?? mode.replace(/^IN_/, '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
export const hours = (h: number) => (h >= 48 ? `${Math.round(h / 24)} d` : `${Math.round(h)} h`)
export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
