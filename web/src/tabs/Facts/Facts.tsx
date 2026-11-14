import { useMemo, useState } from 'react'
import { useData, useRawData } from '../../data/DataContext'
import { useProfile } from '../../profile/profile'
import { facts, type Fact, type Kind } from '../../analytics/facts'
import { Bill, Field, Pass, PrintIn, Stamp } from '../../world'
import { Fig } from '../../world/figures/Figures'
import { bedText, SITE } from '../../share/text'
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
  const all = useMemo(() => facts(raw, units, data.meta.range), [raw, units, data.meta.range])
  const [seed, setSeed] = useState(0)
  const list = useMemo(() => arrange(all, seed), [all, seed])
  const kinds = ORDER.filter((k) => all.some((f) => f.kind === k))
  const year = new Date(data.meta.range[1] * 1000).getUTCFullYear()

  return (
    <>
      <main className="bills facts-head">
        <Bill className="hero" share={false}>
          <div className="two">
            <div>
              <h1 className="title"><span className="misreg">Fun</span><span className="misreg red">Facts</span></h1>
              <p className="lede sub">{all.length ? `${all.length} things your record says about you, read sideways. Firsts are judged over the whole record, so a January trip stays new when you cut the range down.` : 'Nothing to say yet. Widen the range, or wait for the record to fill in.'}</p>
            </div>
            <div className="facts-kinds">
              {kinds.map((k) => <Field key={k} label={KIND[k]} big>{all.filter((f) => f.kind === k).length}</Field>)}
              {all.length > 1 && <button className="btn quiet" onClick={() => setSeed(Date.now() & 0xffff)}>Shuffle →</button>}
            </div>
          </div>
          <div className="foot"><span>{kinds.map((k) => KIND[k]).join(' · ')}</span><span>{units === 'mi' ? 'Miles' : 'Kilometres'}</span></div>
          <Stamp top="Fun facts" big={String(year)} bottom="live" />
        </Bill>
      </main>
      {list.length > 0 && (
        <main className="strip dense facts">
          {list.map((f, i) => {
            const wide = f.figure && WIDE.has(f.figure.t)
            const text = () => (f.figure?.t === 'beds' ? bedText(f.figure.nights, f.headline.toUpperCase()) : `${f.headline.toUpperCase()}\n${f.detail}\n${SITE}`)
            return (
              <Pass key={f.id} className={`fact ${f.kind}`} text={text} stub={
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
