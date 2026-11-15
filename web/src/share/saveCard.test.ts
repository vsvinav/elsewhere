// @vitest-environment jsdom
import { deliver, printable } from './saveCard'

const el = (tag: string, cls = '') => { const e = document.createElement(tag); if (cls) e.className = cls; return e }

describe('printable', () => {
  it('keeps the poster and drops the controls', () => {
    expect(printable(el('p'))).toBe(true)
    expect(printable(el('div', 'yearwheel dragging'))).toBe(false)
    expect(printable(el('button'))).toBe(false)
    expect(printable(el('div', 'save'))).toBe(false)
    expect(printable(document.createTextNode('2024'))).toBe(true)
  })
})

describe('deliver', () => {
  const canvas = () => {
    const c = document.createElement('canvas')
    c.toBlob = (cb) => cb(new Blob(['png'], { type: 'image/png' }))
    c.toDataURL = () => 'data:image/png;base64,AA=='
    return c
  }
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  beforeEach(() => { click.mockClear() })
  afterEach(() => { vi.unstubAllGlobals() })
  const nav = (share: (d: ShareData) => Promise<void>) => { vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share }) }

  it('a handheld that can share files gets the share sheet, not a download', async () => {
    const share = vi.fn((_d: ShareData) => Promise.resolve()); nav(share)
    await deliver(canvas(), 'card.png', true)
    expect(share).toHaveBeenCalledOnce()
    expect(share.mock.calls[0]![0].files![0]!.name).toBe('card.png')
    expect(click).not.toHaveBeenCalled()
  })
  it('a desktop downloads even when it could share', async () => {
    const share = vi.fn((_d: ShareData) => Promise.resolve()); nav(share)
    await deliver(canvas(), 'card.png', false)
    expect(share).not.toHaveBeenCalled()
    expect(click).toHaveBeenCalledOnce()
  })
  it('a cancelled or refused share falls back to the download', async () => {
    nav(() => Promise.reject(new DOMException('cancelled', 'AbortError')))
    await deliver(canvas(), 'card.png', true)
    expect(click).toHaveBeenCalledOnce()
  })
})
