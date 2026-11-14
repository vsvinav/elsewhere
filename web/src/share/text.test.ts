import { bedText, SITE } from './text'
import type { Night } from '../analytics/beds'

const n = (date: string, kind: Night['kind'], city: string | null = null): Night => ({ date, kind, city })

test('short ranges wrap by week, Monday first, with the caption and site', () => {
  // 2025-01-01 is a Wednesday: two blank cells of padding.
  const t = bedText([n('2025-01-01', 'home'), n('2025-01-02', 'new', 'Paris'), n('2025-01-03', 'repeat', 'Paris'), n('2025-01-04', 'none')], 'ELSEWHERE 2025')
  expect(t.split('\n')).toEqual(['ELSEWHERE 2025 · 2 nights away · 1 city', '　　⬛🟥🟨⬜', SITE])
})

test('long ranges get one row per month', () => {
  const nights: Night[] = []
  for (let d = new Date(Date.UTC(2025, 0, 1)); d < new Date(Date.UTC(2025, 3, 1)); d.setUTCDate(d.getUTCDate() + 1)) nights.push(n(d.toISOString().slice(0, 10), 'home'))
  const rows = bedText(nights, 'X').split('\n')
  expect(rows).toHaveLength(5)
  expect([...rows[1]].length).toBe(31)
  expect([...rows[2]].length).toBe(28)
})
