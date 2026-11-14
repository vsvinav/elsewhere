const PAD = 72
const SCALE = 2
export type Format = 'free' | 'story' | 'post'
const SIZE: Record<Exclude<Format, 'free'>, [number, number]> = { story: [1080, 1920], post: [1080, 1350] }

/** Renders one bill to a PNG on its own stock and downloads it; story (9:16) and post (4:5) letterbox the bill on the sheet with a brand line. */
export async function saveCard(pass: HTMLElement, name: string, format: Format = 'free') {
  const { toCanvas } = await import('html-to-image')
  const css = getComputedStyle(pass)
  const paper = css.backgroundColor && css.backgroundColor !== 'rgba(0, 0, 0, 0)' ? css.backgroundColor : getComputedStyle(document.documentElement).getPropertyValue('--stock').trim() || '#efe6d2'
  const ink = css.color
  const card = await toCanvas(pass, {
    pixelRatio: SCALE,
    // controls and affordances are for the screen, not the print
    filter: (n) => !(n instanceof HTMLElement && (/^(BUTTON|SELECT|INPUT|LABEL)$/.test(n.tagName) || n.classList.contains('more') || n.classList.contains('save'))),
  })
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
  // In the app shell (no download manager) hand the card to the system share sheet.
  if ('Capacitor' in window && navigator.canShare) {
    const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'))
    if (blob) {
      const f = new File([blob], file, { type: 'image/png' })
      if (navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: 'elsewhere' }).catch(() => {}); return }
    }
  }
  const a = document.createElement('a')
  a.href = out.toDataURL('image/png')
  a.download = file
  a.click()
}
