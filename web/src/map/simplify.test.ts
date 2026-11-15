import { degPerPx, simplifyIdx } from './simplify'

test('jitter along a straight line collapses to its endpoints, a real corner survives', () => {
  const line: [number, number][] = Array.from({ length: 50 }, (_, i) => [i / 10, (i % 2) * 0.004])
  expect(simplifyIdx(line, 0.01)).toEqual([0, 49])
  const corner: [number, number][] = [[0, 0], [1, 0.001], [2, 0], [2, 2]]
  expect(simplifyIdx(corner, 0.01)).toEqual([0, 2, 3])
})
test('tolerance of one pixel is tighter the further you zoom in', () => {
  expect(degPerPx(14)).toBeLessThan(degPerPx(6) / 200)
})
