import { expect, test } from 'vitest'
import { categoryOf } from './category'

test('reads a kind of stop off Google types', () => {
  expect(categoryOf({ primary_type: 'pizza_restaurant', types: [], role: null })).toBe('eat')
  expect(categoryOf({ primary_type: 'subway_station', types: ['transit_station'], role: null })).toBe('transit')
  expect(categoryOf({ primary_type: null, types: ['point_of_interest', 'hotel'], role: null })).toBe('stay')
  expect(categoryOf({ primary_type: 'bus_stop', types: [], role: null })).toBe('transit')
  expect(categoryOf({ primary_type: null, types: [], role: 'work' })).toBe('work')
  expect(categoryOf({ primary_type: null, types: [], role: null })).toBe('other')
})
