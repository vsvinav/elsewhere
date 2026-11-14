import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Data } from '../data/types'
import { Field, Stamp } from '../world'
import { STAGE_LABEL } from '../ingest'
import { settings, useSettings } from '../ingest/settings'
import { profile as store, type Home, type Profile, type Work } from './profile'
import { sleepPlaces, weekdayPlaces, moveMonths, type Suggestion } from './suggest'
import './onboarding.css'

type Step = 'start' | 'name' | 'home' | 'moved' | 'work' | 'units'
const ORDER: Step[] = ['start', 'name', 'home', 'moved', 'work', 'units']
const MILES = new Set(['US', 'GB', 'LR', 'MM'])

interface Props {
  /** The loaded record, if any; suggestions come from it. */
  data: Data | null
  /** True while the record is the bundled sample: every step may be skipped. */
  demo: boolean
  stage: string | null
  importError: Error | null
  importFile(f: File): void
  /** Editing an existing profile: start at the name step and prefill. */
  initial?: Profile | null
  onClose?: () => void
}

/** The front door: file + key or the demo, then five short questions that make the record theirs. */
export function Onboarding({ data, demo, stage, importError, importFile, initial, onClose }: Props) {
  const { mapsKey } = useSettings()
  const [step, setStep] = useState<Step>(initial || (data && !demo) ? 'name' : 'start')
  const [name, setName] = useState(initial?.name ?? '')
  const [homes, setHomes] = useState<Home[]>(initial?.homes ?? [])
  const [work, setWork] = useState<Work | null>(initial?.work ?? null)
  const [units, setUnits] = useState<'km' | 'mi'>(initial?.units ?? 'km')
  const [key, setKey] = useState(mapsKey)
  const sleep = useMemo(() => (data ? sleepPlaces(data, 8) : []), [data])
  const weekday = useMemo(() => (data ? weekdayPlaces(data) : []), [data])
  const moves = useMemo(() => (data ? moveMonths(data) : []), [data])
  // A fresh import lands while the visitor is on the start step; move them along.
  useEffect(() => { if (data && !demo && step === 'start') setStep('name') }, [data, demo, step])

  const i = ORDER.indexOf(step)
  const next = () => setStep(ORDER[i + 1])
  const back = () => setStep(ORDER[Math.max(1, i - 1)])
  const finish = (h = homes) => {
    const sorted = [...h].sort((a, b) => a.from - b.from).map((x, k, arr) => ({ ...x, to: arr[k + 1]?.from ?? null }))
    store.set({ name: name.trim() || null, units, homes: sorted, work })
    onClose?.()
  }
  const asHome = (s: Suggestion, from = 0): Home => ({ lat: s.lat, lng: s.lng, city: s.city ?? '', cc: s.cc ?? '', from, to: null })
  const pickHome = (s: Suggestion) => { setHomes([asHome(s)]); if (!initial) setUnits(MILES.has(s.cc ?? '') ? 'mi' : 'km') }
  const label = (s: Suggestion) => data?.places[s.place_id]?.name ?? s.city ?? 'Unnamed place'
  const isSame = (h: Home, s: Suggestion) => h.lat === s.lat && h.lng === s.lng
  const range = data?.meta.range ?? [0, 0]

  return (
    <main className="ob">
      <section className="bill ob-bill">
        <div className="peel">
          <header className="ob-head">
            <span className="ob-mark" aria-hidden>E</span>
            {step !== 'start' && (
              <ol className="ob-steps" aria-label="Progress">
                {ORDER.slice(1).map((s) => <li key={s} aria-current={s === step ? 'step' : undefined} data-done={ORDER.indexOf(s) < i || undefined} />)}
              </ol>
            )}
            {onClose && <button className="btn quiet ob-cancel" onClick={onClose}>Cancel</button>}
          </header>

          {step === 'start' && (
            <div className="ob-start">
              <div>
                <h1 className="title"><span className="misreg">Else</span><span className="misreg red">where</span></h1>
                <p className="lede">Your Google Maps Timeline, printed as a poster. Every city you slept in, every flight, every drive. It never leaves this browser.</p>
              </div>
              <div>
              <label className={`dropzone ob-drop${stage ? ' busy' : ''}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) importFile(f) }}>
                <input type="file" accept=".json,application/json" hidden disabled={!!stage} onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = '' }} />
                <div className="dz-title">{stage ? `${STAGE_LABEL[stage] ?? stage}…` : 'Drop your Timeline.json here'}</div>
                <div className="dz-sub">{stage ? 'Big exports take a few seconds.' : <>Android: Settings → Location → Timeline → Export. iPhone: Google Maps → your photo → Your timeline → ⋯ → Export.</>}</div>
                {importError && <div className="ob-error" role="alert">{importError.message}</div>}
              </label>
              <div className="ob-key">
                <Field label="Google Maps key · optional, for the map pages">
                  <input className="val" type="password" value={key} onChange={(e) => setKey(e.target.value)} onBlur={() => settings.set({ mapsKey: key.trim() })} placeholder="AIza…" aria-label="Google Maps API key" spellCheck={false} autoComplete="off" />
                </Field>
              </div>
              {demo && data && <button className="btn quiet ob-demo" onClick={() => setStep('name')}>Try the demo record instead →</button>}
              </div>
            </div>
          )}

          {step === 'name' && (
            <Q n={1} title="Whose record is this?" sub="It prints on the poster." onNext={next} skip={next}>
              <input className="ob-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') next() }} placeholder="First name" maxLength={24} aria-label="First name" />
            </Q>
          )}

          {step === 'home' && (
            <Q n={2} title="Where is home?" sub="Ranked by where your phone sleeps. Trips, nights away and distance all start here." onBack={back} onNext={homes.length ? next : undefined} skip={demo && sleep.length ? () => { pickHome(sleep[0]); next() } : undefined}>
              <div className="ob-tags">
                {sleep.map((s) => (
                  <button key={s.place_id} className="tag ob-tag" aria-pressed={homes.length === 1 && isSame(homes[0], s)} onClick={() => pickHome(s)}>
                    <span className="lab">{s.cc || '—'}</span>
                    <span className="name">{label(s)}</span>
                    <span className="sub">{s.city && label(s) !== s.city ? `${s.city} · ` : ''}{s.score} {s.score === 1 ? 'night' : 'nights'}</span>
                  </button>
                ))}
                {!sleep.length && <p className="lede">No overnight stays found in this record.</p>}
              </div>
              {homes.length > 0 && <HomeList homes={homes} setHomes={setHomes} range={range} hint="Since when? Leave it blank if you lived here for the whole record." />}
            </Q>
          )}

          {step === 'moved' && (
            <Q n={3} title="Did you live anywhere else?" sub={moves.length ? `Your nights shift in ${moves.map((m) => m.month).join(' and ')}. Tap a place to add it as a home, then set the month each one started.` : 'Add another home and the month it started. Skip if you stayed put.'} onBack={back} onNext={next} skip={next}>
              <div className="ob-tags">
                {sleep.filter((s) => !homes.some((h) => isSame(h, s))).map((s) => {
                  const mv = moves.find((m) => m.to === s.place_id)
                  const from = mv ? Date.parse(mv.month + '-01') / 1000 : range[0]
                  return (
                    <button key={s.place_id} className="tag ob-tag" onClick={() => setHomes([...homes, asHome(s, from)])}>
                      <span className="lab">{mv ? `from ${mv.month}` : s.cc || '—'}</span>
                      <span className="name">{label(s)}</span>
                      <span className="sub">{s.score} {s.score === 1 ? 'night' : 'nights'}</span>
                    </button>
                  )
                })}
              </div>
              <HomeList homes={homes} setHomes={setHomes} range={range} />
            </Q>
          )}

          {step === 'work' && (
            <Q n={4} title="Where do you spend weekdays?" sub="Optional. Skip it and nothing about work is printed." onBack={back} onNext={next} skip={() => { setWork(null); next() }}>
              <div className="ob-tags">
                {weekday.map((s) => (
                  <button key={s.place_id} className="tag ob-tag" aria-pressed={work?.place_id === s.place_id} onClick={() => setWork(work?.place_id === s.place_id ? null : { lat: s.lat, lng: s.lng, place_id: s.place_id })}>
                    <span className="lab">{s.cc || '—'}</span>
                    <span className="name">{label(s)}</span>
                    <span className="sub">{Math.round(s.score)} weekday hours</span>
                  </button>
                ))}
                {!weekday.length && <p className="lede">No regular weekday place stands out.</p>}
              </div>
            </Q>
          )}

          {step === 'units' && (
            <Q n={5} title="Kilometres or miles?" onBack={back} onNext={() => finish()} nextLabel="Print my record">
              <div className="ob-units" role="radiogroup" aria-label="Units">
                <button className="btn" aria-pressed={units === 'km'} onClick={() => setUnits('km')}>Kilometres</button>
                <button className="btn" aria-pressed={units === 'mi'} onClick={() => setUnits('mi')}>Miles</button>
              </div>
            </Q>
          )}
        </div>
        {step !== 'start' && <Stamp top="Official" big={`${Math.min(i, 5)}/5`} bottom="record" style={{ position: 'absolute', right: 'var(--gutter)', bottom: 56 }} />}
      </section>
    </main>
  )
}

function Q({ n, title, sub, children, onNext, onBack, skip, nextLabel = 'Next' }: { n: number; title: string; sub?: string; children: ReactNode; onNext?: () => void; onBack?: () => void; skip?: () => void; nextLabel?: string }) {
  return (
    <div className="ob-q" data-n={n}>
      <h2 className="ob-title">{title}</h2>
      {sub && <p className="lede">{sub}</p>}
      {children}
      <div className="ob-actions">
        <button className="btn" disabled={!onNext} onClick={onNext}>{nextLabel}</button>
        {skip && <button className="btn quiet" onClick={skip}>Skip</button>}
        {onBack && <button className="btn quiet ob-back" onClick={onBack}>Back</button>}
      </div>
    </div>
  )
}

const monthOf = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 7)

/** Chosen homes with the month each became home; blank means "from the start of the record". */
function HomeList({ homes, setHomes, range, hint }: { homes: Home[]; setHomes: (h: Home[]) => void; range: [number, number]; hint?: string }) {
  return (
    <div className="ob-homelist">
      {hint && <p className="ob-hint">{hint}</p>}
      <ol className="ob-homes" aria-label="Your homes">
        {[...homes].sort((a, b) => a.from - b.from).map((h) => (
          <li key={`${h.lat},${h.lng}`}>
            <span className="name">{h.city || 'Home'}</span>
            <label className="ob-month"><span className="lab">home since</span><input type="month" value={h.from ? monthOf(h.from) : ''} min={monthOf(range[0])} max={monthOf(range[1])} onChange={(e) => setHomes(homes.map((x) => x === h ? { ...x, from: e.target.value ? Date.parse(e.target.value + '-01') / 1000 : 0 } : x))} aria-label={`${h.city} home since`} /></label>
            {homes.length > 1 && <button className="btn quiet" onClick={() => setHomes(homes.filter((x) => x !== h))}>Remove</button>}
          </li>
        ))}
      </ol>
    </div>
  )
}
