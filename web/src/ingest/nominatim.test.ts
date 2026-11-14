import { expect, test } from 'vitest'
import { shortAddress } from './nominatim'

test('short address keeps the number, road and the area people say', () => {
  expect(shortAddress({ house_number: '2180', road: 'Cranston Road', suburb: 'University Heights', city: 'Cleveland' })).toBe('2180 Cranston Road, University Heights')
  expect(shortAddress({ road: 'Main St', city: 'Boston' })).toBe('Main St, Boston')
  expect(shortAddress({ city: 'Boston' })).toBeNull()
})
