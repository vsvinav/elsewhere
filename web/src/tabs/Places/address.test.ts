import { stopAddress } from './address'

test('a Places address is cut to its first line plus the city', () => {
  expect(stopAddress({ address: '1 Devonshire Pl, Boston, MA 02109, USA', city: 'Boston' }, undefined)).toBe('1 Devonshire Pl, Boston')
  expect(stopAddress({ address: '1 Devonshire Pl, Boston, MA 02109, USA', city: null }, undefined)).toBe('1 Devonshire Pl')
})

test('without a Places address the Nominatim string is used', () => {
  expect(stopAddress({ address: null, city: 'Boston' }, '2180 Cranston Rd, University Heights')).toBe('2180 Cranston Rd, University Heights')
  expect(stopAddress({ city: 'Boston' }, '2180 Cranston Rd, University Heights')).toBe('2180 Cranston Rd, University Heights')
})

test('nothing from either source gives null', () => {
  expect(stopAddress({ address: null, city: 'Boston' }, null)).toBeNull()
  expect(stopAddress({ address: '', city: 'Boston' }, undefined)).toBeNull()
})

test('a first line that is just the city counts as missing', () => {
  expect(stopAddress({ address: 'Boston, MA, USA', city: 'Boston' }, null)).toBeNull()
  expect(stopAddress({ address: 'Boston, MA, USA', city: 'Boston' }, '12 Beacon St, Beacon Hill')).toBe('12 Beacon St, Beacon Hill')
})
