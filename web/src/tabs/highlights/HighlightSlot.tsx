import { useCallback } from 'react'
import { useRawData } from '../../data/DataContext'
import { useStore } from '../../store/useStore'
import { HighlightCard } from './HighlightCard'

/** The highlight card wired to the store: doors open the Map tab on the exact range. */
export function HighlightSlot() {
  const raw = useRawData()
  const setRange = useStore((s) => s.setRange), setPlayhead = useStore((s) => s.setPlayhead), setTab = useStore((s) => s.setTab)
  const onOpen = useCallback((range: [number, number], playhead?: number) => { setRange(range); if (playhead != null) setPlayhead(playhead); setTab('map') }, [setRange, setPlayhead, setTab])
  const onKeyStep = useCallback(() => setTab('home'), [setTab])
  return (
    <main className="bills highlights">
      <HighlightCard data={raw} onOpen={onOpen} onKeyStep={onKeyStep} />
    </main>
  )
}
