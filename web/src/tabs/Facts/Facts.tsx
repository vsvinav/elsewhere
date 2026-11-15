import { useEffect, useMemo, useState } from 'react'
import { useData, useRawData } from '../../data/DataContext'
import { useProfile } from '../../profile/profile'
import { need } from '../../ingest/places'
import { facts, type Fact, type Kind } from '../../analytics/facts'
import { Bill, Field, Pass, PrintIn, Stamp } from '../../world'
import { Fig } from '../../world/figures/Figures'
import { bedText, SITE } from '../../share/text'
import { HighlightSlot } from '../highlights/HighlightSlot'
import './facts.css'

const KIND: Record<Kind, string> = { explored: 'Explored', record: 'Record', scale: 'Scale', habit: 'Habit' }
const ORDER: Kind[] = ['explored', 'record', 'scale', 'habit']
/** Figures that read at 300px go on the stub; the wide ones sit under the text. */
const WIDE = new Set(['scale', 'beds'])

/** Deterministic shuffle within each kind so a reshuffle keeps the explored → habit arc. */
function arrange(list: Fact[], seed: number): Fact[] {
  if (!seed) return list
  let s = seed
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  return ORDER.flatMap((k) => {
    const part = list.filter((f) => f.kind === k)
    for (let i = part.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [part[i], part[j]] = [part[j], part[i]] }
    return part
  })
}

export function Facts() {
  const data = useData()
  const raw = useRawData()
  const prof = useProfile()
  const units = prof?.units ?? 'km'
  const all = useMemo(() => facts(data, units, raw), [data, units, raw])
  // A few facts read names and types of the most visited places; ask for those thirty, not the whole record.
  useEffect(() => { need(Object.entries(raw.places).sort((a, b) => b[1].n_visits - a[1].n_visits).slice(0, 30).map(([id]) => id), raw.places) }, [raw.places])
  const [seed, setSeed] = useState(0)
  const [only, setOnly] = useState<Kind | null>(null)
  // The card turns the short quips up top; every fact, quip or not, still prints in the list below.
  const cards = useMemo(() => { const c = all.filter((f) => f.card); return c.length >= 2 ? c : all }, [all])
  const rest = all
  const list = useMemo(() => arrange(rest, seed).filter((f) => !only || f.kind === only), [rest, seed, only])
  const kinds = ORDER.filter((k) => rest.some((f) => f.kind === k))
  const year = new Date(data.meta.range[1] * 1000).getUTCFullYear()
  // One fact at a time up top, turning every few seconds unless the pointer rests on it.
  const [at, setAt] = useState(0)
  const [hold, setHold] = useState(false)
  useEffect(() => { setAt(0) }, [cards])
  useEffect(() => {
    if (hold || cards.length < 2) return
    const t = setInterval(() => setAt((i) => (i + 1) % cards.length), 6000)
    return () => clearInterval(t)
  }, [hold, cards.length])
  const star = cards[at]
  const jump = (f: Fact) => document.getElementById(`fact-${f.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })

  return (
    <>
      <HighlightSlot />
      <main className="bills facts-head">
        <Bill className="hero" share={false}>
          <div className="two">
            <div>
              <h1 className="title"><span className="misreg">Fun</span><span className="misreg red">Facts</span></h1>
              <p className="lede sub">{all.length ? `${rest.length} things your record says about you, read sideways. Firsts are judged over the whole record, so a January trip stays new when you cut the range down.` : 'Nothing to say yet. Widen the range, or wait for the record to fill in.'}</p>
            </div>
            {star && (
              <div className="feature" onPointerEnter={() => setHold(true)} onPointerLeave={() => setHold(false)}>
                <div className="feature-top"><Field label={star.card ? 'Side note' : KIND[star.kind]}>{at + 1} of {cards.length}</Field><span className="feature-bar" key={`${star.id}-${hold}`} data-hold={hold || undefined} /></div>
                <button key={star.id} className="feature-card" onClick={() => (star.card ? setAt((at + 1) % cards.length) : jump(star))} aria-label={star.card ? 'Next' : `Go to: ${star.headline}`}>
                  {star.figure && !WIDE.has(star.figure.t) && <div className="feature-fig"><Fig f={star.figure} /></div>}
                  <h2 className="fact-h quip">{star.quip ?? star.headline}</h2>
                  {star.figure && WIDE.has(star.figure.t) && <div className="feature-wide"><Fig f={star.figure} /></div>}
                </button>
                <div className="feature-nav">
                  <button className="btn quiet" onClick={() => setAt((at + cards.length - 1) % cards.length)} aria-label="Previous fact">←</button>
                  <button className="btn quiet" onClick={() => setAt((at + 1) % cards.length)} aria-label="Next fact">→</button>
                  {all.length > 1 && <button className="btn quiet" onClick={() => setSeed(Date.now() & 0xffff)}>Shuffle</button>}
                </div>
              </div>
            )}
          </div>
          <div className="foot">
            <span className="facts-kinds" role="group" aria-label="Show only">
              {kinds.map((k) => <button key={k} aria-pressed={only === k} onClick={() => setOnly(only === k ? null : k)}>{KIND[k]} <b>{rest.filter((f) => f.kind === k).length}</b></button>)}
            </span>
            <span>{units === 'mi' ? 'Miles' : 'Kilometres'}</span>
          </div>
          <Stamp top="Fun facts" big={String(year)} bottom="live" />
        </Bill>
      </main>
      {list.length > 0 && (
        <main className="strip dense facts">
          {list.map((f, i) => {
            const wide = f.figure && WIDE.has(f.figure.t)
            const text = () => (f.figure?.t === 'beds' ? bedText(f.figure.nights, f.headline.toUpperCase()) : `${f.headline.toUpperCase()}\n${f.detail}\n${SITE}`)
            return (
              <Pass key={f.id} id={`fact-${f.id}`} className={`fact ${f.kind}`} text={text} stub={
                <PrintIn>
                  <Field label={KIND[f.kind]}>{i + 1} of {list.length}</Field>
                  {f.figure && !wide && <div className="fact-fig"><Fig f={f.figure} /></div>}
                </PrintIn>
              }>
                <PrintIn>
                  <h2 className="fact-h">{f.headline}</h2>
                  <p className="fact-p">{f.detail}</p>
                  {f.figure && wide && <div className="fact-wide"><Fig f={f.figure} /></div>}
                </PrintIn>
              </Pass>
            )
          })}
        </main>
      )}
    </>
  )
}
