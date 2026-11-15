import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { useRawData } from '../../data/DataContext'
import { earnedIds, passport, tilt, type Page, type Stamp } from '../../analytics/passport'
import { Field, Pass } from '../../world'
import { doorProps } from '../../world/Door'
import { date } from '../../world/fmt'
import './passport.css'

export const SEEN_KEY = 'passport.seen'
const THUD_MS = 240

const readSeen = (): Set<string> | null => {
  try { const raw = localStorage.getItem(SEEN_KEY); return raw ? new Set(JSON.parse(raw) as string[]) : null } catch { return null }
}
const writeSeen = (ids: string[]) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids)) } catch { /* private mode: the thud plays again next time */ } }
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Stamps earned since the booklet was last open press in once; the first ever open just records what is there.
 * Returns the ids to animate now.
 */
function useFresh(earned: string[]): Set<string> {
  const [fresh, setFresh] = useState<Set<string>>(() => new Set())
  const key = earned.join('\n')
  useEffect(() => {
    const seen = readSeen()
    const now = earned.filter((id) => seen && !seen.has(id))
    writeSeen(earned)
    if (!now.length || reduced()) return
    setFresh(new Set(now))
    const t = setTimeout(() => setFresh(new Set()), THUD_MS + 60)
    return () => clearTimeout(t)
  }, [key])
  return fresh
}

/** `10 NIGHTS AWAY` prints as a big 10 over small words; a city prints as its name. */
const split = (label: string): [string | null, string] => {
  const m = /^([\d,]+)\s+(.+)$/.exec(label)
  return m ? [m[2], m[1]] : [null, label]
}

function StampView({ s, fresh }: { s: Stamp; fresh: boolean }) {
  const style = { '--tilt': `${tilt(s.id)}deg` } as CSSProperties
  const [top, big] = split(s.label)
  if (s.earnedAt == null || !s.door) {
    return (
      <div className="pstamp ghost" role="button" aria-disabled="true" aria-label={`${s.label}: not yet`} style={style}>
        {top && <small>{top}</small>}
        <b>{big}</b>
        <small>not yet</small>
      </div>
    )
  }
  return (
    <div className={`pstamp ${fresh ? 'thud' : ''}`} {...doorProps(s.door)} style={style}>
      <small>{top ?? s.sub ?? ''}</small>
      <b>{big}</b>
      <small>{date(s.earnedAt)}</small>
    </div>
  )
}

function PageView({ page, index, total, current, fresh }: { page: Page; index: number; total: number; current: boolean; fresh: Set<string> }) {
  const earned = page.stamps.filter((s) => s.earnedAt != null).length
  return (
    <div className="passport-leaf" aria-current={current ? 'page' : undefined} aria-label={`${page.title}, page ${index + 1} of ${total}`} role="group">
      <Pass className="passport-page" text={() => `${page.title}\n${page.stamps.filter((s) => s.earnedAt != null).map((s) => `${s.label} · ${date(s.earnedAt!)}`).join('\n')}`}>
        <header className="passport-page-head">
          <h2 className="passport-title">{page.title}</h2>
          <span className="caps passport-count">{earned} / {page.stamps.length} earned</span>
        </header>
        <div className="pstamps">
          {page.stamps.map((s) => <StampView key={s.id} s={s} fresh={fresh.has(s.id)} />)}
        </div>
        <span className="caps passport-pageno">{String(index + 1).padStart(2, '0')} · {String(total).padStart(2, '0')}</span>
      </Pass>
    </div>
  )
}

/** The booklet: a page per country and one of milestones, swiped or arrowed through, every earned stamp a door. */
export function Passport() {
  const raw = useRawData()
  const pass = useMemo(() => passport(raw), [raw])
  const earned = useMemo(() => earnedIds(pass), [pass])
  const fresh = useFresh(earned)
  const total = pass.pages.reduce((a, p) => a + p.stamps.length, 0)
  const n = pass.pages.length
  const [at, setAt] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const go = (i: number) => {
    const next = Math.max(0, Math.min(n - 1, i))
    setAt(next)
    const el = ref.current
    if (el && typeof el.scrollTo === 'function') el.scrollTo({ left: next * el.clientWidth, behavior: reduced() ? 'auto' : 'smooth' })
  }
  const onScroll = () => {
    const el = ref.current
    if (!el || !el.clientWidth) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i !== at) setAt(i)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1) }
  }

  return (
    <section className="passport" aria-label="Passport" tabIndex={0} onKeyDown={onKey}>
      <div className="passport-head">
        <div>
          <h2 className="title passport-h"><span className="misreg">Pass</span><span className="misreg red">port</span></h2>
          <p className="lede sub">Pages per country and per milestone. Stamps you have earned carry their date; the outlines are the ones to aim for.</p>
        </div>
        <Field label="Stamped">{earned.length} / {total}</Field>
      </div>
      <div className="passport-nav">
        <button type="button" className="btn quiet" onClick={() => go(at - 1)} disabled={at === 0} aria-label="Previous page">←</button>
        <span className="caps" aria-live="polite">Page {at + 1} of {n}</span>
        <button type="button" className="btn quiet" onClick={() => go(at + 1)} disabled={at >= n - 1} aria-label="Next page">→</button>
      </div>
      <div className="passport-pages" ref={ref} onScroll={onScroll}>
        {pass.pages.map((p, i) => <PageView key={p.id} page={p} index={i} total={n} current={i === at} fresh={fresh} />)}
      </div>
    </section>
  )
}
