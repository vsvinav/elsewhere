import { expect, test } from 'vitest'
import { dollars, getUsage, resetUsage, tally } from './usage'

test('tally adds up and prices at list rates', () => {
  resetUsage()
  tally('details', 100); tally('photos', 100); tally('maps', 10)
  const u = getUsage()
  expect([u.details, u.photos, u.maps]).toEqual([100, 100, 10])
  expect(dollars(u)).toBeCloseTo(1.7 + 0.7 + 0.07)
})
