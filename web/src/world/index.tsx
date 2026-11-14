import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'

/** Content prints in top-down, line by line, the first time it scrolls into view. */
export function PrintIn({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    Array.from(el.children).forEach((c, i) => (c as HTMLElement).style.setProperty('--i', String(i)))
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect() } }, { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return <div ref={ref} className={`print ${on ? 'on' : ''} ${className}`}>{children}</div>
}

/** Number that counts up in fixed tabular slots once visible. */
export function CountUp({ value, digits = 0, duration = 1400 }: { value: number; digits?: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(value); return }
    let raf = 0
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const t0 = performance.now()
      const tick = (t: number) => {
        const k = Math.min(1, (t - t0) / duration)
        setShown(value * (1 - Math.pow(1 - k, 3)))
        if (k < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }, { threshold: 0.3 })
    io.observe(el)
    return () => { io.disconnect(); cancelAnimationFrame(raf) }
  }, [value, duration])
  return <span ref={ref}>{shown.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}</span>
}

export function Field({ label, children, ghost = false, big = false }: { label: string; children?: ReactNode; ghost?: boolean; big?: boolean }) {
  const empty = children == null || children === '' || ghost
  return (
    <div className="field">
      <div className="lab">{label}</div>
      <div className={`val ${big ? 'n' : ''} ${empty ? 'ghost' : ''}`}>{empty ? (big ? '—' : 'not on record') : children}</div>
    </div>
  )
}

/** A pass: printed body on stock plus a torn-off stub. */
export function Pass({ children, stub, stripe = false, share = true, className = '' }: { children: ReactNode; stub?: ReactNode; stripe?: boolean; share?: boolean; className?: string }) {
  const ref = useRef<HTMLElement>(null)
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle')
  const save = async (e: MouseEvent) => {
    e.stopPropagation()
    const el = ref.current
    if (!el || state === 'busy') return
    setState('busy')
    try {
      const name = el.querySelector('h1, h2, h3, .val')?.textContent ?? 'card'
      await (await import('../share/saveCard')).saveCard(el, name)
      setState('idle')
    } catch (err) {
      console.error(err)
      setState('failed')
      setTimeout(() => setState('idle'), 2500)
    }
  }
  const label = { idle: 'Save', busy: 'Saving…', failed: "Couldn't save" }[state]
  return (
    <article ref={ref} className={`pass ${stub ? '' : 'one'} ${className}`}>
      <div className={`body ${stub ? 'perf' : ''}`}>
        {stripe && <div className="stripe" />}
        {children}
      </div>
      {stub && <aside className="stub">{stub}</aside>}
      {share && <button type="button" className="save" onClick={save} disabled={state === 'busy'} aria-label="Save this pass as an image">{label}</button>}
    </article>
  )
}

// shortcut: bars are a deterministic hash of the text, not a scannable Code 128; upgrade if anyone needs to scan it.
export function Barcode({ text }: { text: string }) {
  let h = 2166136261
  const bars: { x: number; w: number }[] = []
  let x = 0
  for (let i = 0; x < 300; i++) {
    h ^= text.charCodeAt(i % text.length); h = Math.imul(h, 16777619) >>> 0
    const w = 1 + (h % 3)
    bars.push({ x, w }); x += w + 1 + ((h >> 8) % 3)
  }
  return (
    <div className="barcode" aria-hidden>
      <svg viewBox="0 0 300 64" preserveAspectRatio="none">
        {bars.map((b, i) => <rect key={i} x={b.x} y={0} width={b.w} height={64} fill="currentColor" />)}
      </svg>
      <div className="code">{text}</div>
    </div>
  )
}
