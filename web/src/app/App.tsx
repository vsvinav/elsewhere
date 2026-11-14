import { useEffect, useState } from 'react'
import { DataContext } from '../data/DataContext'
import { DataLoadError, loadData } from '../data/load'
import type { Data } from '../data/types'
import { useStore } from '../store/useStore'
import { StubNav } from './StubNav'
import { Home } from '../tabs/Home/Home'
import { Pass, Field } from '../world'
import { MapScreen } from '../map/MapScreen'

export function App() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<Error | null>(null)
  useEffect(() => {
    loadData().then((d) => {
      const [, m1] = d.meta.range
      const r0 = Math.max(d.meta.range[0], m1 - 90 * 86400)
      useStore.getState().setTimeRange([r0, m1])
      useStore.getState().setPlayhead(r0)
      setData(d)
    }).catch(setError)
  }, [])
  useEffect(() => {
    const onHash = () => { const t = location.hash.slice(1); if (t && t !== useStore.getState().tab) useStore.getState().setTab(t as never) }
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="tray">
      <StubNav />
      {error ? <LoadFailed error={error} /> : data ? <DataContext.Provider value={data}><Screen /></DataContext.Provider> : <Printing />}
    </div>
  )
}

function Screen() {
  const tab = useStore((s) => s.tab)
  if (tab === 'map' || tab === 'play') return <MapScreen />
  if (tab === 'home') return <Home />
  return (
    <main className="strip">
      <Pass stripe>
        <div className="fields"><Field label="Section">{tab}</Field><Field label="Status" ghost /></div>
        <div className="big"><span className="ghost">NOT YET PRINTED</span></div>
      </Pass>
    </main>
  )
}

function Printing() {
  return (
    <main className="strip">
      <Pass stripe><div className="fields"><Field label="Status">Printing your record…</Field></div></Pass>
    </main>
  )
}

function LoadFailed({ error }: { error: Error }) {
  return (
    <main className="strip">
      <Pass stripe>
        <div className="fields">
          <Field label="Status">Couldn't load the record</Field>
          <Field label="Detail">{error instanceof DataLoadError ? error.url : error.message}</Field>
        </div>
        <p className="drop">Run <code>python -m pipeline build timeline.json</code> and reload.</p>
      </Pass>
    </main>
  )
}
