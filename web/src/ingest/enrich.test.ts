import { properName } from './enrich'

test('properName rejects addresses Google returns as display names', () => {
  expect(properName({ name: '1200 Longfellow Dr', types: ['street_address'] })).toBe(false)
  expect(properName({ name: 'Devonshire Rd', primary_type: 'route' })).toBe(false)
  expect(properName({ name: 'Boston', types: ['locality', 'political'] })).toBe(false)
  expect(properName({ name: null, types: ['apartment_complex'] })).toBe(false)
})
test('properName keeps business and building names', () => {
  expect(properName({ name: 'The Savoy', primary_type: 'apartment_complex' })).toBe(true)
  expect(properName({ name: 'Longfellow Place', types: ['premise', 'apartment_building', 'point_of_interest'] })).toBe(true)
})
