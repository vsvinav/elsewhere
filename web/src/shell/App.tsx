import { useEffect, useState } from 'react'
import { DataContext } from '../data/DataContext'
import { DataLoadError, loadData } from '../data/load'
import type { Data } from '../data/types'
import { useStore } from '../store/useStore'
import { insightById } from '../insights/registry'
import { MapView } from './MapView'
import { Chips } from './Chips'
import { TopRight } from './TopRight'
import { Scrubber } from './Scrubber'
import { usePlayback } from './usePlayback'

export function App() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<DataLoadError | Error | null>(null)

  useEffect(() => {
    loadData().then((d) => {
      // Default range: the last 90 days of the export; playhead starts at range start.
      const [, m1] = d.meta.range
      const r0 = Math.max(d.meta.range[0], m1 - 90 * 86400)
      useStore.getState().setTimeRange([r0, m1])
      useStore.getState().setPlayhead(r0)
      setData(d)
    }).catch(setError)
  }, [])

  if (error) {
    return (
      <div className="fullscreen error">
        <h1>Couldn't load data</h1>
        <p>{error instanceof DataLoadError ? <code>{error.url}</code> : error.message}</p>
        <p>Run <code>python -m pipeline build timeline.json</code> and reload.</p>
      </div>
    )
  }
  if (!data) return <div className="fullscreen">Loading your timeline…</div>

  return (
    <DataContext.Provider value={data}>
      <Shell />
    </DataContext.Provider>
  )
}

function Shell() {
  usePlayback()
  const active = useStore((s) => s.activeInsight)
  const Panel = insightById[active]?.Panel
  return (
    <>
      <MapView />
      <div className="topleft">
        <Chips />
        {Panel && <Panel />}
      </div>
      <TopRight />
      <Scrubber />
    </>
  )
}
