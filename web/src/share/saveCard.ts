const PAD = 72
const SCALE = 2

/** Renders one pass to a PNG on a slice of the tray and downloads it. */
export async function saveCard(pass: HTMLElement, name: string) {
  const { toCanvas } = await import('html-to-image')
  const tray = getComputedStyle(document.documentElement).getPropertyValue('--tray').trim() || '#0b0c10'
  const card = await toCanvas(pass, {
    pixelRatio: SCALE,
    // controls and affordances are for the screen, not the print
    filter: (n) => !(n instanceof HTMLElement && (/^(BUTTON|SELECT|INPUT|LABEL)$/.test(n.tagName) || n.classList.contains('more'))),
  })
  const out = document.createElement('canvas')
  out.width = card.width + PAD * 2 * SCALE
  out.height = card.height + PAD * 2 * SCALE
  const g = out.getContext('2d')!
  g.fillStyle = tray
  g.fillRect(0, 0, out.width, out.height)
  g.drawImage(card, PAD * SCALE, PAD * SCALE)
  const a = document.createElement('a')
  a.href = out.toDataURL('image/png')
  a.download = `elsewhere-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'card'}.png`
  a.click()
}
