import { snapshotCanvases } from './snapshot'

const PAD = 72
const SCALE = 2
export type Format = 'free' | 'story' | 'post'
const SIZE: Record<Exclude<Format, 'free'>, [number, number]> = { story: [1080, 1920], post: [1080, 1350] }

/** What the print keeps: controls and affordances are for the screen, not the card. */
export const printable = (n: Node) =>
  !(n instanceof HTMLElement && (/^(BUTTON|SELECT|INPUT|LABEL)$/.test(n.tagName) || n.classList.contains('more') || n.classList.contains('save') || n.classList.contains('yearwheel') || n.classList.contains('hint') || n.classList.contains('crew-tools')))

/** Renders one bill to a PNG on its own stock and downloads it; story (9:16) and post (4:5) letterbox the bill on the sheet with a brand line. */
export async function saveCard(pass: HTMLElement, name: string, format: Format = 'free') {
  const { toCanvas } = await import('html-to-image')
  const css = getComputedStyle(pass)
  const paper = css.backgroundColor && css.backgroundColor !== 'rgba(0, 0, 0, 0)' ? css.backgroundColor : getComputedStyle(document.documentElement).getPropertyValue('--stock').trim() || '#efe6d2'
  const ink = css.color
  // WebGL canvases (the globe) are frozen to images first so the print shows the frame on screen at the click.
  const snap = snapshotCanvases(pass)
  let card: HTMLCanvasElement
  try {
    await snap.ready
    card = await toCanvas(pass, { pixelRatio: SCALE, filter: printable })
  } finally { snap.restore() }
  const out = document.createElement('canvas')
  const g = out.getContext('2d')!
  if (format === 'free') {
    out.width = card.width + PAD * 2 * SCALE
    out.height = card.height + PAD * 2 * SCALE
    g.fillStyle = paper
    g.fillRect(0, 0, out.width, out.height)
    g.drawImage(card, PAD * SCALE, PAD * SCALE)
  } else {
    const [w, h] = SIZE[format]
    out.width = w * SCALE; out.height = h * SCALE
    g.fillStyle = paper
    g.fillRect(0, 0, out.width, out.height)
    const pad = 60 * SCALE, foot = 120 * SCALE
    const k = Math.min((out.width - pad * 2) / card.width, (out.height - pad * 2 - foot) / card.height)
    const cw = card.width * k, ch = card.height * k
    g.drawImage(card, (out.width - cw) / 2, (out.height - foot - ch) / 2, cw, ch)
    g.fillStyle = ink
    g.fillRect(pad, out.height - foot, out.width - pad * 2, 3 * SCALE)
    g.font = `900 ${34 * SCALE}px "Big Shoulders Display Variable", Impact, sans-serif`
    g.textBaseline = 'middle'
    g.fillText('ELSEWHERE', pad, out.height - foot / 2 + 6 * SCALE)
    g.font = `600 ${13 * SCALE}px "Archivo Variable", Archivo, sans-serif`
    g.textAlign = 'right'
    g.fillText('MY WORLD TOUR · FROM MY GOOGLE TIMELINE', out.width - pad, out.height - foot / 2 + 6 * SCALE)
  }
  const file = `elsewhere-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'card'}${format === 'free' ? '' : `-${format}`}.png`
  await deliver(out, file)
}

/** A phone or the shell: the system share sheet is where a picture goes. On a desktop it would only get in the way of the download. */
export const handheld = () => typeof window !== 'undefined' && ('Capacitor' in window || matchMedia('(pointer: coarse)').matches)

/** Hands the PNG to the share sheet on a handheld; downloads it otherwise, or when the share is refused or cancelled. */
export async function deliver(out: HTMLCanvasElement, file: string, mobile = handheld()) {
  if (mobile && navigator.canShare) {
    const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'))
    if (blob) {
      const f = new File([blob], file, { type: 'image/png' })
      if (navigator.canShare({ files: [f] })) {
        try { await navigator.share({ files: [f], title: 'elsewhere' }); return } catch { /* cancelled or refused: fall through to the download */ }
      }
    }
  }
  const a = document.createElement('a')
  a.href = out.toDataURL('image/png')
  a.download = file
  a.click()
}
