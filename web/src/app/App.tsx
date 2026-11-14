import { Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { DataContext } from '../data/DataContext'
import { DataLoadError, loadData, loadPaths } from '../data/load'
import type { Data, Place } from '../data/types'
import { clearRecord, ingestFile, loadRecord, rederive } from '../ingest'
import { UsageRow } from '../usage/Meter'
import { Onboarding } from '../profile/Onboarding'
import { profile as profileStore, useProfile, type Profile } from '../profile/profile'
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
const FlightScreen = lazy(() => import('../tabs/Flights/Flights').then((m) => ({ default: m.Flights })))
const FactsScreen = lazy(() => import('../tabs/Facts/Facts').then((m) => ({ default: m.Facts })))
const MapScreen = lazy(() => import('../map/MapScreen').then((m) => ({ default: m.MapScreen })))

export interface Record_ { mine: boolean; stage: string | null; importError: Error | null; enrichError: Error | null; importFile(f: File): void; reset(): void; editProfile(): void }
/** Used to parse a fresh import before the visitor has answered the home question; the real profile re-derives. */
const PROVISIONAL: Profile = { name: null, units: 'km', homes: [{ lat: 0, lng: 0, city: '', cc: '', from: 0, to: null }], works: [] }
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
  const [editing, setEditing] = useState(false)
  const prof = useProfile()
  const { mapsKey } = useSettings()
  const adopt = useCallback((d: Data, isMine: boolean) => { useStore.getState().setPlayhead(d.meta.range[0]); useStore.getState().setRange(null); setPlaces(null); setMine(isMine); setRecord(d) }, [])
  useEffect(() => {
    loadData().then(async (d) => adopt(d, !!(await loadRecord().catch(() => undefined)))).catch(setError)
  }, [adopt])
  // The record follows the profile: when home or work moves, trips and days are worked out again.
  const homesKey = JSON.stringify([prof?.homes ?? null, prof?.works ?? null])
  useEffect(() => {
    if (!record || !prof) return
    if (JSON.stringify([record.profile.homes ?? null, record.profile.works ?? null]) === homesKey) return
    let live = true
    rederive(record, prof, setStage).then((d) => { if (!live) return; setStage(null); setRecord({ ...d, paths: record.paths }) }).catch((e) => { if (live) { setStage(null); setImportError(e) } })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.meta.source_sha256, homesKey])
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
  // Paid lookups only for the visitor's own record once onboarding is done; the demo and the questions stay free.
  const spend = mine && !!prof
  useEffect(() => {
    if (!record) return
    setEnrichError(null)
    return enrichPlaces(record, spend ? mapsKey : '', setPlaces, setEnrichError)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sha, mapsKey, spend])
  const data = useMemo(() => (record && places ? { ...record, places } : record), [record, places])
  const ctx = useMemo<Record_>(() => ({
    mine, stage, importError, enrichError,
    importFile: (f) => { setImportError(null); ingestFile(f, profileStore.get() ?? PROVISIONAL, setStage).then((d) => { setStage(null); adopt(d, true); if (profileStore.get()) useStore.getState().setTab('home') }).catch((e) => { setStage(null); setImportError(e) }) },
    reset: () => { profileStore.set(null); clearRecord().then(() => loadData()).then((d) => adopt(d, false)).catch(setError) },
    editProfile: () => setEditing(true),
  }), [mine, stage, importError, enrichError, adopt])
  // Chrome tucks away once the first bill has scrolled off; the heads underneath print clean.
  useEffect(() => {
    const onScroll = () => document.body.toggleAttribute('data-scrolled', scrollY > 240)
    addEventListener('scroll', onScroll, { passive: true })
    return () => removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    const onHash = () => { const t = location.hash.slice(1); if (t && t !== useStore.getState().tab) useStore.getState().setTab(t as never) }
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  const goHome = () => { useStore.getState().setTab('home'); scrollTo({ top: 0, behavior: 'smooth' }) }
  if (error) return <div className="tray"><LoadFailed error={error} /></div>
  if (!record) return <div className="tray"><Printing /></div>
  if (!prof || editing) {
    return <Onboarding key={editing ? 'edit' : 'new'} data={data} demo={!mine} stage={stage} importError={importError} importFile={ctx.importFile} initial={editing ? prof : null} onClose={editing ? () => setEditing(false) : undefined} />
  }
  return (
    <div className="tray">
      <div className="tourline">
        <button className="home" onClick={goHome} aria-label="Back to the tour"><span className="mark">E</span><span className="caps">Else<b>where</b> · {prof.name ? `${prof.name}'s record` : 'your record'}</span></button>
        <details className="account">
          <summary aria-label="Account">▾</summary>
          <div className="menu">
            <button onClick={ctx.editProfile}>Edit profile</button>
            <button onClick={ctx.reset}>{mine ? 'Start over' : 'Set up your record'}</button>
            <UsageRow />
          </div>
        </details>
      </div>
      <StubNav />
      {data && <RecordContext.Provider value={ctx}><DataContext.Provider value={data}><RangeBar /><Screen /></DataContext.Provider></RecordContext.Provider>}
    </div>
  )
}

function Screen() {
  const tab = useStore((s) => s.tab)
  if (tab === 'map' || tab === 'play') return <Suspense fallback={<Printing />}><MapScreen /></Suspense>
  if (tab === 'flights') return <Suspense fallback={<Printing />}><FlightScreen /></Suspense>
  if (tab === 'facts') return <Suspense fallback={<Printing />}><FactsScreen /></Suspense>
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
