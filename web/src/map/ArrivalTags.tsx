import { useEffect, useRef, useState } from 'react'
import { useData } from '../data/DataContext'
import { useStore, useThrottledPlayhead } from '../store/useStore'
import { placeName } from '../analytics/home'
import { isHome } from '../analytics/geo'

interface Arrival { key: number; id: string; nth: number; at: number }
const KEEP = 3
const TTL_MS = 7000

/** Luggage tags that print when the playhead arrives somewhere new. */
export function ArrivalTags() {
  const data = useData()
  const playhead = useThrottledPlayhead(100)
  const playing = useStore((s) => s.playing)
  const [tags, setTags] = useState<Arrival[]>([])
  const lastVisit = useRef<number | null>(null)

  useEffect(() => {
    if (!playing || playhead == null) return
    const v = data.visits.find((x) => x.lvl === 0 && x.start <= playhead && playhead <= x.end)
    if (!v || v.id === lastVisit.current) return
    lastVisit.current = v.id
    if (isHome(v.type)) return
    const nth = data.visits.filter((x) => x.lvl === 0 && x.place_id === v.place_id && x.start <= v.start).length
    setTags((t) => [{ key: v.id, id: v.place_id, nth, at: Date.now() }, ...t].slice(0, KEEP))
  }, [playhead, playing, data])

  useEffect(() => {
    const i = setInterval(() => setTags((t) => t.filter((x) => Date.now() - x.at < TTL_MS)), 500)
    return () => clearInterval(i)
  }, [])

  return (
    <div className="arrivals" aria-live="polite">
      {tags.map((t) => {
        const p = data.places[t.id]
        return (
          <div className="tag print on" key={t.key}>
            <div>
              {p?.photo && <img className="photo" src={p.photo} alt="" />}
              <div className="lab">{t.nth === 1 ? 'First visit' : `Visit nº ${t.nth}`}</div>
              <div className="name">{placeName(p, t.id)}</div>
              <div className="sub">{[p?.city, p?.country_code].filter(Boolean).join(', ') || 'city not on record'}</div>
            </div>
            <i className={`tape ${p?.name ? '' : 'ghost'}`} />
          </div>
        )
      })}
    </div>
  )
}

export function HoverTag() {
  const data = useData()
  const h = useStore((s) => s.hoverPlace)
  if (!h) return null
  const p = data.places[h.id]
  if (!p) return null
  return (
    <div className="tag hover" style={{ left: h.x + 16, top: h.y + 16 }}>
      <div>
        {p.photo && <img className="photo" src={p.photo} alt="" />}
        <div className="lab">{p.primary_type?.replace(/_/g, ' ') ?? 'place'}</div>
        <div className="name">{placeName(p, h.id)}</div>
        <div className="sub">{p.n_visits} visits · {p.city ?? 'city not on record'}</div>
      </div>
      <i className={`tape ${p.name ? '' : 'ghost'}`} />
    </div>
  )
}
