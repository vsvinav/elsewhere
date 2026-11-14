import { useEffect, useMemo } from 'react'
import { useData } from '../../data/DataContext'
import { useStore } from '../../store/useStore'
import { cardsFor } from './layers'
import { useWrapped } from './state'

function yearsIn(range: [number, number]): number[] {
  const y0 = new Date(range[0] * 1000).getUTCFullYear(), y1 = new Date(range[1] * 1000).getUTCFullYear()
  return Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i)
}
function yearRange(y: number, clamp: [number, number]): [number, number] {
  return [Math.max(clamp[0], Date.UTC(y, 0, 1) / 1000), Math.min(clamp[1], Date.UTC(y + 1, 0, 1) / 1000 - 1)]
}

export function WrappedPanel() {
  const data = useData()
  const range = useStore((s) => s.timeRange)
  const setTimeRange = useStore((s) => s.setTimeRange)
  const flyTo = useStore((s) => s.flyTo)
  const { index, setIndex } = useWrapped()
  const cards = useMemo(() => cardsFor(data, range), [data, range])
  const card = cards[Math.min(index, cards.length - 1)]

  const years = yearsIn(data.meta.range)
  const activeYear = years.find((y) => { const r = yearRange(y, data.meta.range); return r[0] === range[0] && r[1] === range[1] })
  const isAll = range[0] === data.meta.range[0] && range[1] === data.meta.range[1]

  useEffect(() => { if (card) flyTo(card.focus) }, [card, flyTo])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') setIndex(Math.min(cards.length - 1, index + 1))
      if (e.key === 'ArrowLeft') setIndex(Math.max(0, index - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cards.length, index, setIndex])

  const pick = (r: [number, number]) => { setTimeRange(r); setIndex(0) }

  return (
    <div className="wrapped">
      <div className="years">
        {years.map((y) => (
          <button key={y} className={`chip ${activeYear === y ? 'on' : ''}`} onClick={() => pick(yearRange(y, data.meta.range))}>{y}</button>
        ))}
        <button className={`chip ${isAll ? 'on' : ''}`} onClick={() => pick(data.meta.range)}>All time</button>
      </div>
      {card ? (
        <div className="card story" onClick={() => setIndex((index + 1) % cards.length)}>
          <div className="dots">{cards.map((_, i) => <i key={i} className={i === index ? 'on' : ''} />)}</div>
          <h1>{card.headline}</h1>
          <p>{card.detail}</p>
          <div className="nav">
            <button onClick={(e) => { e.stopPropagation(); setIndex(Math.max(0, index - 1)) }} disabled={index === 0}>←</button>
            <span className="muted">{index + 1} / {cards.length}</span>
            <button onClick={(e) => { e.stopPropagation(); setIndex(Math.min(cards.length - 1, index + 1)) }} disabled={index === cards.length - 1}>→</button>
          </div>
        </div>
      ) : <div className="card story"><h1>Nothing here yet</h1><p>Pick a year above.</p></div>}
    </div>
  )
}
