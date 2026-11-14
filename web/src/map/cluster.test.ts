import { cluster } from './cluster'

const near = [{ lng: 0, lat: 0, id: 'a' }, { lng: 0.001, lat: 0.001, id: 'b' }, { lng: 10, lat: 10, id: 'c' }]

test('close points merge at low zoom and split when zoomed in', () => {
  const low = cluster(near, 2)
  expect(low.groups).toHaveLength(1)
  expect(low.groups[0].items.map((p) => p.id).sort()).toEqual(['a', 'b'])
  expect(low.singles.map((p) => p.id)).toEqual(['c'])
  const high = cluster(near, 16)
  expect(high.groups).toHaveLength(0)
  expect(high.singles).toHaveLength(3)
})
