import { useMemo, useState } from 'react'
import { useData } from '../data/DataContext'
import { useStore } from '../store/useStore'
import { CATS, CAT_COLOR, CAT_LABEL, categoryOf } from '../analytics/category'
import { isHome } from '../analytics/geo'
import { placeName } from '../analytics/home'
import { fmtDate } from '../analytics/format'
import { useUnits } from '../profile/units'
import { Photo } from '../usage/Meter'
import { liveCam } from './live'

const PAD = { top: 80, bottom: 260, left: 60, right: 60 }

/** The Map tab's panel: what is pinned, a way to find one, and the open pin's tag. */
export function PinHud() {
  const data = useData()
  const hidden = useStore((s) => s.hiddenCats)
  const pin = useStore((s) => s.pin)
  const sizeBy = useStore((s) => s.pinSize)
  const { toggleCat, setHiddenCats, setPin, setPinSize } = useStore.getState()
  const [q, setQ] = useState('')

  const stops = useMemo(() => Object.entries(data.places).filter(([, p]) => !isHome(p)).map(([id, p]) => ({ id, p, cat: categoryOf(p) })), [data])
  const counts = useMemo(() => { const n = Object.fromEntries(CATS.map((c) => [c, 0])) as Record<string, number>; for (const s of stops) n[s.cat]++; return n }, [stops])
  const shown = useMemo(() => stops.filter((s) => !hidden.includes(s.cat)), [stops, hidden])
  const sum = useMemo(() => ({ cities: new Set(shown.map((s) => s.p.city).filter(Boolean)).size, countries: new Set(shown.map((s) => s.p.country_code).filter(Boolean)).size }), [shown])
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (t.length < 2) return []
    // Homes are searchable too, even though the chips never count them.
    const pool = [...shown, ...Object.entries(data.places).filter(([, p]) => isHome(p)).map(([id, p]) => ({ id, p, cat: categoryOf(p) }))]
    return pool.filter((s) => `${placeName(s.p, s.id)} ${s.p.city ?? ''}`.toLowerCase().includes(t)).sort((a, b) => b.p.n_visits - a.p.n_visits).slice(0, 6)
  }, [q, shown, data])

  const go = (id: string) => {
    const p = data.places[id]
    setPin(id); setQ('')
    liveCam.get()?.move({ lng: p.lng, lat: p.lat }, 15)
  }
  const fit = () => {
    if (!shown.length) return
    const lngs = shown.map((s) => s.p.lng), lats = shown.map((s) => s.p.lat)
    liveCam.get()?.fit([Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)], PAD)
  }

  return (
    <div className="hud pins">
      <div className="hud-cats" aria-label="Kinds of stop">
        {CATS.filter((c) => counts[c]).map((c) => {
          const on = !hidden.includes(c)
          return (
            <button key={c} aria-pressed={on} className={on ? 'on' : ''} onClick={() => toggleCat(c)}
              onDoubleClick={() => setHiddenCats(CATS.filter((x) => x !== c))} title="Click to toggle · double-click for only this">
              <i className="ink" style={{ background: CAT_COLOR[c] }} />{CAT_LABEL[c]}<small>{counts[c].toLocaleString('en-US')}</small>
            </button>
          )
        })}
        {hidden.length > 0 && <button className="all" onClick={() => setHiddenCats([])}>Show all</button>}
      </div>
      <div className="pins-row">
        <span className="pins-sum">{shown.length.toLocaleString('en-US')} stops · {sum.cities} {sum.cities === 1 ? 'city' : 'cities'} · {sum.countries} {sum.countries === 1 ? 'country' : 'countries'}</span>
        <div className="pins-find">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a stop…" aria-label="Find a stop" onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) go(hits[0].id); if (e.key === 'Escape') setQ('') }} />
          {hits.length > 0 && (
            <ul className="pins-hits" role="listbox">
              {hits.map((h) => <li key={h.id} role="option" aria-selected={false} onMouseDown={() => go(h.id)}><i className="ink" style={{ background: CAT_COLOR[h.cat] }} />{placeName(h.p, h.id)}<small>{h.p.city ?? ''} · {h.p.n_visits}×</small></li>)}
            </ul>
          )}
        </div>
        <div className="pins-size" role="radiogroup" aria-label="Pin size">
          <span className="lab">Size by</span>
          {(['visits', 'hours'] as const).map((k) => <button key={k} role="radio" aria-checked={sizeBy === k} className={sizeBy === k ? 'on' : ''} onClick={() => setPinSize(k)}>{k}</button>)}
        </div>
        <button className="btn quiet pins-fit" onClick={fit}>Fit pins</button>
      </div>
      {pin && data.places[pin] && <PinCard id={pin} onClose={() => setPin(null)} />}
    </div>
  )
}

function PinCard({ id, onClose }: { id: string; onClose(): void }) {
  const data = useData()
  const { u, cv } = useUnits()
  const p = data.places[id]
  const cat = categoryOf(p)
  const visits = data.visits.filter((v) => v.lvl === 0 && v.place_id === id)
  const tz = visits[0]?.tz ?? 0
  const home = data.profile.home
  const kmFromHome = Math.round(Math.hypot((p.lat - home.lat) * 111, (p.lng - home.lng) * 111 * Math.cos((home.lat * Math.PI) / 180)))
  return (
    <div className="tag pin-card">
      <button className="close" onClick={onClose} aria-label="Close">×</button>
      <div>
        {p.photo && <Photo src={p.photo} />}
        <div className="lab"><i className="ink" style={{ background: CAT_COLOR[cat] }} />{p.primary_type?.replace(/_/g, ' ') ?? CAT_LABEL[cat]}</div>
        <div className="name">{placeName(p, id)}</div>
        <div className="sub">{[p.address ?? p.city, p.country_code].filter(Boolean).join(' · ') || 'city not on record'}</div>
      </div>
      <dl className="pin-facts">
        <div><dt>Visits</dt><dd>{p.n_visits}</dd></div>
        <div><dt>Time there</dt><dd>{p.total_hours >= 48 ? `${Math.round(p.total_hours / 24)} days` : `${Math.round(p.total_hours)} h`}</dd></div>
        <div><dt>First</dt><dd>{fmtDate(p.first_ts, tz)}</dd></div>
        <div><dt>Last</dt><dd>{fmtDate(p.last_ts, tz)}</dd></div>
        <div><dt>From home</dt><dd>{Math.round(cv(kmFromHome)).toLocaleString('en-US')} {u}</dd></div>
      </dl>
    </div>
  )
}
