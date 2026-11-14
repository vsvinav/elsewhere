import type { Place } from '../data/types'

/** Kinds of stop, read off what Google says a place is. Places never looked up land in `other`. */
export type Cat = 'eat' | 'stay' | 'shop' | 'culture' | 'transit' | 'work' | 'other'
export const CATS: Cat[] = ['eat', 'stay', 'shop', 'culture', 'transit', 'work', 'other']
export const CAT_LABEL: Record<Cat, string> = { eat: 'Food & drink', stay: 'Stays', shop: 'Shops', culture: 'Out & about', transit: 'Transit', work: 'Work & study', other: 'Unsorted' }
export const CAT_COLOR: Record<Cat, string> = { eat: '#d63c20', stay: '#e9b531', shop: '#e8762c', culture: '#1e4f8f', transit: '#6b6358', work: '#141414', other: '#9c9385' }

const RULES: [Cat, RegExp][] = [
  ['transit', /station|airport|_stop$|terminal|transit|port$/],
  ['stay', /hotel|lodging|motel|resort|hostel|inn$|guest_house|campground/],
  ['eat', /restaurant|cafe|coffee|bar$|pub|bakery|food|pastry|dessert|ice_cream|tea_house|brewery|winery|diner/],
  ['shop', /store|shop|mall|market|grocery|supermarket|pharmacy|boutique|dealer/],
  ['culture', /museum|park|plaza|arena|stadium|theat|gallery|tourist|attraction|zoo|aquarium|library|church|temple|mosque|landmark|beach|garden|trail|gym|fitness|spa$|salon|cinema|night_club|amusement/],
  ['work', /office|business|university|school|college|research|corporate|institute|coworking|government|bank/],
]

export function categoryOf(p: Pick<Place, 'primary_type' | 'types' | 'role'>): Cat {
  if (p.role === 'work') return 'work'
  const hay = [p.primary_type ?? '', ...(p.types ?? [])].join(' ')
  if (!hay.trim()) return 'other'
  for (const [cat, re] of RULES) if (re.test(hay)) return cat
  return 'other'
}
