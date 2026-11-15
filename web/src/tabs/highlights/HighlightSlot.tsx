import { useCallback } from 'react'
import { useRawData } from '../../data/DataContext'
import { useStore } from '../../store/useStore'
import { HighlightCard } from './HighlightCard'

/** The highlight card wired to the store: doors open the Map tab on the exact range. */
export function HighlightSlot() {
  const raw = useRawData()
  const goTo = useStore((s) => s.goTo), setTab = useStore((s) => s.setTab)
  // A highlight is a door too: the origin tag reads "FROM · ON THIS DAY" and Back returns here.
  const onOpen = useCallback((range: [number, number], playhead?: number, placeIds?: string[]) => {
    goTo({ kind: 'range', from: range[0], to: range[1], label: 'On this day' })
    useStore.setState((s) => ({ playhead: playhead ?? s.playhead, focus: placeIds?.length ? { ids: placeIds, n: s.focus?.n ?? 1 } : s.focus }))
  }, [goTo])
  const onKeyStep = useCallback(() => setTab('home'), [setTab])
  return (
    <main className="bills highlights">
      <HighlightCard data={raw} onOpen={onOpen} onKeyStep={onKeyStep} />
    </main>
  )
}
