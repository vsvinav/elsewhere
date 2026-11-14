import { fitZoom, step, zoomForKmh } from './camera'

test('spring settles on its target without overshooting past it noticeably', () => {
  const s = { x: 0, v: 0 }
  let maxX = 0
  for (let i = 0; i < 600; i++) { step(s, 10, 1 / 60, 1.2); maxX = Math.max(maxX, s.x) }
  expect(s.x).toBeCloseTo(10, 2)
  expect(maxX).toBeLessThan(10.6)
})

test('zoom drops as speed rises and fitZoom frames a flight', () => {
  expect(zoomForKmh(3)).toBeGreaterThan(zoomForKmh(30))
  expect(zoomForKmh(30)).toBeGreaterThan(zoomForKmh(800))
  const bos = { lat: 42.36, lng: -71.06 }, sfo = { lat: 37.62, lng: -122.38 }
  expect(fitZoom(bos, sfo, 1440, 900)).toBeLessThan(4.6)
  expect(fitZoom(bos, { lat: 42.37, lng: -71.07 }, 1440, 900)).toBeGreaterThan(13)
})
