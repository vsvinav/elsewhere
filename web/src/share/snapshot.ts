/**
 * Freezes every <canvas> under `el` into an <img> of its current pixels so a DOM-to-image pass prints the frame on
 * screen right now (a WebGL globe at its current turn, a pulse mid-route) rather than whatever the renderer has
 * in its buffer when the clone finally reaches it. The canvas stays in place, hidden, so its context keeps
 * drawing; `restore()` puts things back.
 */
export function snapshotCanvases(el: HTMLElement): { ready: Promise<void>; restore(): void } {
  const undo: (() => void)[] = []
  const loads: Promise<unknown>[] = []
  for (const canvas of Array.from(el.querySelectorAll('canvas'))) {
    let url = ''
    try { url = canvas.toDataURL() } catch { /* tainted or lost context: leave this one to the cloner */ }
    if (!url || url === 'data:,') continue
    const img = document.createElement('img')
    img.alt = ''
    img.src = url
    img.style.cssText = canvas.style.cssText
    const r = canvas.getBoundingClientRect()
    if (r.width && r.height) { img.style.width = `${r.width}px`; img.style.height = `${r.height}px` }
    img.className = canvas.className
    const hidden = canvas.style.visibility
    canvas.style.visibility = 'hidden'
    canvas.after(img)
    loads.push(typeof img.decode === 'function' ? img.decode().catch(() => {}) : Promise.resolve())
    undo.push(() => { img.remove(); canvas.style.visibility = hidden })
  }
  return { ready: Promise.all(loads).then(() => {}), restore: () => { while (undo.length) undo.pop()!() } }
}
