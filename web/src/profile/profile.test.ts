import { homeAt, type Home } from './profile'

const a: Home = { lat: 42.36, lng: -71.06, city: 'Boston', cc: 'US', from: 0, to: 1_700_000_000 }
const b: Home = { lat: 37.37, lng: -122.04, city: 'Sunnyvale', cc: 'US', from: 1_700_000_000, to: null }

test('homeAt picks the home whose window covers ts, open-ended last', () => {
  expect(homeAt([a, b], 1_600_000_000)).toBe(a)
  expect(homeAt([a, b], 1_700_000_000)).toBe(b)
  expect(homeAt([a, b], 1_900_000_000)).toBe(b)
})
test('homeAt falls back to the first home before every window', () => {
  const late = { ...a, from: 100 }
  expect(homeAt([late, b], 50)).toBe(late)
})
test('a home can recur as a later stint after someone else was home', () => {
  const b2 = { ...b, to: 1_800_000_000 }
  const again: Home = { ...a, from: 1_800_000_000, to: null }
  expect(homeAt([a, b2, again], 1_750_000_000)).toBe(b2)
  expect(homeAt([a, b2, again], 1_850_000_000)).toBe(again)
})
