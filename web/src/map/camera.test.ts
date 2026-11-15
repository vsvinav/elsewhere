import { approachZoom, calmFor, dwellZoom, fitZoom, step, zoomCapFor, zoomForKmh } from './camera'

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

test('faster replay calms the camera and lowers the zoom ceiling; zoom pulls out at once but pushes in slowly', () => {
  const stroll = 3600, dayPerSecond = 24 * 3600
  expect(calmFor(stroll)).toBe(1)
  expect(calmFor(dayPerSecond)).toBeGreaterThan(2)
  expect(zoomCapFor(stroll)).toBe(15.5)
  expect(zoomCapFor(dayPerSecond)).toBeLessThan(8)
  expect(approachZoom(14, 6, 0.016, stroll)).toBe(6)
  expect(approachZoom(6, 14, 0.5, stroll)).toBeCloseTo(6.7, 5)
  expect(approachZoom(6, 14, 0.5, dayPerSecond)).toBeLessThan(6.4)
})

test('dwell zoom frames a cluster of recent positions and goes to street level for one spot', () => {
  const a = { lng: -71.06, lat: 42.36 }
  expect(dwellZoom([a, a, a], 1440, 900)).toBe(15.5)
  expect(dwellZoom([a, { lng: -71.2, lat: 42.4 }], 1440, 900)).toBeLessThan(13)
})
