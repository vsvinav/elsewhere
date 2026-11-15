import { useEffect, useMemo, useRef, useState } from 'react'
import { useData, useRawData } from '../../data/DataContext'
import { useProfile } from '../../profile/profile'
import { need } from '../../ingest/places'
import { facts, type Fact, type Kind } from '../../analytics/facts'
import { Bill, Field, Pass, PrintIn, Stamp } from '../../world'
import { Fig } from '../../world/figures/Figures'
import { Door } from '../../world/Door'
import { bedText, SITE } from '../../share/text'
import { localToday } from '../../analytics/highlights'
import { HubDeck } from './HubDeck'
import { Passport } from './Passport'
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
  const [open, setOpen] = useState(false)
  const list = useMemo(() => arrange(all, seed).filter((f) => !only || f.kind === only), [all, seed, only])
  const kinds = ORDER.filter((k) => all.some((f) => f.kind === k))
  const year = new Date(data.meta.range[1] * 1000).getUTCFullYear()
  const days = Math.max(1, Math.round((data.meta.range[1] - data.meta.range[0]) / 86400))
  const today = useMemo(() => localToday(), [])
  const listRef = useRef<HTMLElement>(null)
  const passRef = useRef<HTMLElement>(null)
  const smooth = (): ScrollBehavior => (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')
  const openKind = (k: Kind) => { setOnly(k); setOpen(true); requestAnimationFrame(() => listRef.current?.scrollIntoView?.({ behavior: smooth(), block: 'start' })) }
  const openPassport = () => passRef.current?.scrollIntoView?.({ behavior: smooth(), block: 'start' })

  return (
    <>
      <main className="bills facts-head">
        <Bill className="hero" share={false}>
          <h1 className="title"><span className="misreg">Play</span></h1>
          <p className="lede sub">{all.length ? `Six cards from ${days.toLocaleString('en-US')} days of record. Each one opens its full pass; the whole list of facts is one tap away.` : 'Nothing to say yet. Widen the range, or wait for the record to fill in.'}</p>
          <HubDeck data={data} raw={raw} facts={all} today={today} units={units} onOpenKind={openKind} onOpenPassport={openPassport} />
          <div className="foot">
            <span>{units === 'mi' ? 'Miles' : 'Kilometres'}</span>
          </div>
          <Stamp top="Play" big={String(year)} bottom="live" />
        </Bill>
      </main>
      <main ref={listRef} className="strip dense facts">
        <div className="hub-all">
          <button type="button" aria-expanded={open} aria-controls="facts-list" onClick={() => setOpen(!open)}>
            <span>All facts</span>
            <span className="caps">{all.length} passes {open ? '−' : '+'}</span>
          </button>
        </div>
        {open && (
          <div id="facts-list">
            <div className="foot facts-filter">
              <span className="facts-kinds" role="group" aria-label="Show only">
                {kinds.map((k) => <button key={k} aria-pressed={only === k} onClick={() => setOnly(only === k ? null : k)}>{KIND[k]} <b>{all.filter((f) => f.kind === k).length}</b></button>)}
              </span>
              {all.length > 1 && <button className="btn quiet" onClick={() => setSeed(Date.now() & 0xffff)}>Shuffle</button>}
            </div>
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
                    <h2 className="fact-h"><Door target={f.door} className="fact-door">{f.headline}</Door></h2>
                    <p className="fact-p">{f.detail}</p>
                    {f.figure && wide && <div className="fact-wide"><Fig f={f.figure} /></div>}
                  </PrintIn>
                </Pass>
              )
            })}
          </div>
        )}
      </main>
      <main ref={passRef} className="strip dense facts-passport">
        <Passport />
      </main>
    </>
  )
}
