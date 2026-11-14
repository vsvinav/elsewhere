import { Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { DataContext } from '../data/DataContext'
import { DataLoadError, loadData, loadPaths } from '../data/load'
import type { Data, Place } from '../data/types'
import { clearRecord, ingestFile, loadRecord } from '../ingest'
import { enrichPlaces } from '../ingest/enrich'
import { useSettings } from '../ingest/settings'
import { useStore } from '../store/useStore'
import { StubNav } from './StubNav'
import { Home } from '../tabs/Home/Home'
import { Stats } from '../tabs/Stats/Stats'
import { Places } from '../tabs/Places/Places'
import { Trips } from '../tabs/Trips/Trips'
import { Pass, Field } from '../world'
import { RangeBar } from './RangeBar'

// deck.gl and Google Maps only ship when the map opens.
const MapScreen = lazy(() => import('../map/MapScreen').then((m) => ({ default: m.MapScreen })))

export interface Record_ { mine: boolean; stage: string | null; importError: Error | null; enrichError: Error | null; importFile(f: File): void; reset(): void }
const RecordContext = createContext<Record_ | null>(null)
export const useRecord = () => useContext(RecordContext)!

export function App() {
  const [record, setRecord] = useState<Data | null>(null)
  const [mine, setMine] = useState(false)
  const [places, setPlaces] = useState<Record<string, Place> | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [stage, setStage] = useState<string | null>(null)
  const [importError, setImportError] = useState<Error | null>(null)
  const [enrichError, setEnrichError] = useState<Error | null>(null)
  const { mapsKey } = useSettings()
  const adopt = useCallback((d: Data, isMine: boolean) => { useStore.getState().setPlayhead(d.meta.range[0]); useStore.getState().setRange(null); setPlaces(null); setMine(isMine); setRecord(d) }, [])
  useEffect(() => {
    loadData().then(async (d) => adopt(d, !!(await loadRecord().catch(() => undefined)))).catch(setError)
  }, [adopt])
  const tab = useStore((s) => s.tab)
  const onMap = tab === 'map' || tab === 'play'
  useEffect(() => {
    if (!onMap || !record || record.paths.length) return
    let live = true
    loadPaths(record).then((paths) => { if (live) setRecord({ ...record, paths }) }).catch(setError)
    return () => { live = false }
  }, [onMap, record])
  // Names and photos land on top of the record, from cache first and then from Places with the visitor's key.
  const sha = record?.meta.source_sha256
  useEffect(() => {
    if (!record) return
    setEnrichError(null)
    return enrichPlaces(record, mapsKey, setPlaces, setEnrichError)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sha, mapsKey])
  const data = useMemo(() => (record && places ? { ...record, places } : record), [record, places])
  const ctx = useMemo<Record_>(() => ({
    mine, stage, importError, enrichError,
    importFile: (f) => { setImportError(null); ingestFile(f, setStage).then((d) => { setStage(null); adopt(d, true); useStore.getState().setTab('home') }).catch((e) => { setStage(null); setImportError(e) }) },
    reset: () => { clearRecord().then(() => loadData()).then((d) => adopt(d, false)).catch(setError) },
  }), [mine, stage, importError, enrichError, adopt])
  useEffect(() => {
    const onHash = () => { const t = location.hash.slice(1); if (t && t !== useStore.getState().tab) useStore.getState().setTab(t as never) }
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="tray">
      <StubNav />
      {error ? <LoadFailed error={error} /> : data ? <RecordContext.Provider value={ctx}><DataContext.Provider value={data}><RangeBar /><Screen /></DataContext.Provider></RecordContext.Provider> : <Printing />}
    </div>
  )
}

function Screen() {
  const tab = useStore((s) => s.tab)
  if (tab === 'map' || tab === 'play') return <Suspense fallback={<Printing />}><MapScreen /></Suspense>
  if (tab === 'stats') return <Stats />
  if (tab === 'places') return <Places />
  if (tab === 'trips') return <Trips />
  return <Home />
}

function Printing() {
  return (
    <main className="strip">
      <Pass stripe share={false}><div className="fields"><Field label="Status">Printing your record…</Field></div></Pass>
    </main>
  )
}

function LoadFailed({ error }: { error: Error }) {
  return (
    <main className="strip">
      <Pass stripe share={false}>
        <div className="fields">
          <Field label="Status">Couldn't load the record</Field>
          <Field label="Detail">{error instanceof DataLoadError ? error.url : error.message}</Field>
        </div>
        <p className="drop">Run <code>python -m pipeline build timeline.json</code> and reload.</p>
      </Pass>
    </main>
  )
}
