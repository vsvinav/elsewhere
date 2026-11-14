import { Photo } from '../usage/Meter'
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from 'react'
import type { Format } from '../share/saveCard'

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

function useSave(ref: RefObject<HTMLElement | null>) {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle')
  const save = async (e: MouseEvent, format: Format = 'free') => {
    e.stopPropagation()
    const el = ref.current
    if (!el || state === 'busy') return
    setState('busy')
    try {
      const name = el.querySelector('h1, h2, h3, .val, .num')?.textContent ?? 'card'
      await (await import('../share/saveCard')).saveCard(el, name, format)
      setState('idle')
    } catch (err) {
      console.error(err)
      setState('failed')
      setTimeout(() => setState('idle'), 2500)
    }
  }
  const label = { idle: 'Save', busy: 'Saving…', failed: "Couldn't save" }[state]
  return { state, save, label }
}

/** Text share: the share sheet or the clipboard, with a short confirmation in the button itself. */
function useShareText(text?: () => string) {
  const [note, setNote] = useState<string | null>(null)
  if (!text) return null
  const share = async (e: MouseEvent) => {
    e.stopPropagation()
    const r = await (await import('../share/text')).shareText(text())
    setNote({ shared: 'Shared', copied: 'Copied', failed: "Couldn't copy" }[r])
    setTimeout(() => setNote(null), 2000)
  }
  return { share, label: note ?? 'Text' }
}

/** Save as-is, or letterboxed for a story (9:16) or a post (4:5). */
function SaveMenu({ state, save, label, what, text }: { state: string; save: (e: MouseEvent, f?: Format) => void; label: string; what: string; text?: () => string }) {
  const busy = state === 'busy'
  const t = useShareText(text)
  return (
    <div className="save" role="group" aria-label={`Save this ${what}`}>
      {t && <button type="button" onClick={t.share} aria-label="Share as text">{t.label}</button>}
      <button type="button" onClick={save} disabled={busy}>{label}</button>
      <button type="button" onClick={(e) => save(e, 'story')} disabled={busy} aria-label="Save as a 9:16 story">9:16</button>
      <button type="button" onClick={(e) => save(e, 'post')} disabled={busy} aria-label="Save as a 4:5 post">4:5</button>
    </div>
  )
}

/** A pass: printed body on stock plus a torn-off stub. */
export function Pass({ children, stub, stripe = false, share = true, className = '', id, text }: { children: ReactNode; stub?: ReactNode; stripe?: boolean; share?: boolean; className?: string; id?: string; text?: () => string }) {
  const ref = useRef<HTMLElement>(null)
  const { state, save, label } = useSave(ref)
  return (
    <article ref={ref} id={id} className={`pass ${stub ? '' : 'one'} ${className}`}>
      <div className={`body ${stub ? 'perf' : ''}`}>
        {stripe && <div className="stripe" />}
        {children}
      </div>
      {stub && <aside className="stub">{stub}</aside>}
      {share && <SaveMenu state={state} save={save} label={label} what="pass" text={text} />}
    </article>
  )
}

/** A bill: one full-bleed poster chapter. Peels off the stack as it scrolls in. */
export function Bill({ children, tone, share = true, className = '', id, text }: { children: ReactNode; tone?: 'ink' | 'red'; share?: boolean; className?: string; id?: string; text?: () => string }) {
  const ref = useRef<HTMLElement>(null)
  const { state, save, label } = useSave(ref)
  return (
    <section ref={ref} id={id} className={`bill ${tone ?? ''} ${className}`}>
      <div className="peel">{children}</div>
      {share && <SaveMenu state={state} save={save} label={label} what="bill" text={text} />}
    </section>
  )
}

/** Round record stamp: a small line, a big figure, a small line. */
export function Stamp({ top, big, bottom, tone, size, style }: { top: string; big: string | number; bottom?: string; tone?: 'ink'; size?: 'sm'; style?: CSSProperties }) {
  return <div className={`stamp ${tone ?? ''} ${size ?? ''}`} style={style} aria-hidden>
    <div>{top}<b>{big}</b>{bottom}</div>
  </div>
}

/** A place slapped on the sheet: photo (or blank stock), name, where. */
export function Sticker({ photo, name, sub, tilt, children, onClick }: { photo?: string | null; name: string; sub?: string | null; tilt?: number; children?: ReactNode; onClick?(): void }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className="sticker" style={tilt != null ? ({ '--tilt': `${tilt}deg` } as CSSProperties) : undefined} onClick={onClick} type={onClick ? 'button' : undefined}>
      {photo ? <Photo src={photo} /> : <div className="blank caps">no photo on record</div>}
      <div className="name">{name}</div>
      {sub && <div className="sub">{sub}</div>}
      {children}
    </Tag>
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
