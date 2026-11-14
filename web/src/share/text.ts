import type { Night } from '../analytics/beds'

export const SITE = 'github.com/vsvinav/elsewhere'
const CELL: Record<Night['kind'], string> = { home: '⬛', new: '🟥', repeat: '🟨', none: '⬜' }

/**
 * The bed strip as text people can paste anywhere: one row per month (31 cells, right-padded)
 * for anything longer than ten weeks, else one row per week, Monday first.
 */
export function bedText(nights: Night[], title: string): string {
  if (!nights.length) return `${title}\n${SITE}`
  const away = nights.filter((n) => n.kind === 'new' || n.kind === 'repeat')
  const cities = new Set(away.map((n) => n.city).filter(Boolean))
  const caption = `${title} · ${away.length} ${away.length === 1 ? 'night' : 'nights'} away${cities.size ? ` · ${cities.size} ${cities.size === 1 ? 'city' : 'cities'}` : ''}`
  const rows: string[] = []
  if (nights.length > 70) {
    const byMonth = new Map<string, Night[]>()
    for (const n of nights) { const k = n.date.slice(0, 7); byMonth.set(k, [...(byMonth.get(k) ?? []), n]) }
    for (const [, ns] of byMonth) rows.push(ns.map((n) => CELL[n.kind]).join(''))
  } else {
    const pad = (new Date(nights[0].date + 'T00:00:00Z').getUTCDay() + 6) % 7
    const cells = [...Array<string>(pad).fill('　'), ...nights.map((n) => CELL[n.kind])]
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7).join(''))
  }
  return [caption, ...rows, SITE].join('\n')
}

/** The share sheet on touch devices, the clipboard everywhere else. */
export async function shareText(text: string): Promise<'shared' | 'copied' | 'failed'> {
  if (typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ text }); return 'shared' } catch (e) { if ((e as Error).name === 'AbortError') return 'failed' }
  }
  try { await navigator.clipboard.writeText(text); return 'copied' } catch { return 'failed' }
}
