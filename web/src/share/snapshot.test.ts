// @vitest-environment jsdom
import { snapshotCanvases } from './snapshot'

test('each canvas is stood in for by an image of its pixels, then put back', async () => {
  const host = document.body.appendChild(document.createElement('div'))
  const canvas = host.appendChild(document.createElement('canvas'))
  canvas.style.cssText = 'width: 100%; height: 100%;'
  canvas.toDataURL = () => 'data:image/png;base64,AAAA'
  const blank = host.appendChild(document.createElement('canvas'))
  blank.toDataURL = () => 'data:,'
  const snap = snapshotCanvases(host)
  await snap.ready
  const imgs = host.querySelectorAll('img')
  expect(imgs).toHaveLength(1)
  expect(imgs[0].src).toBe('data:image/png;base64,AAAA')
  expect(imgs[0].style.width).toBe('100%')
  expect(canvas.style.visibility).toBe('hidden')
  expect(blank.style.visibility).toBe('')
  snap.restore()
  expect(host.querySelectorAll('img')).toHaveLength(0)
  expect(canvas.style.visibility).toBe('')
  host.remove()
})
