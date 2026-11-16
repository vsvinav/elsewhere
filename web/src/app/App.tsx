import { Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { DataContext } from '../data/DataContext'
import { DataLoadError, loadData, loadPaths } from '../data/load'
import type { Data } from '../data/types'
import { clearRecord, ingestFile, loadRecord, rederive } from '../ingest'
import { UsageRow } from '../usage/Meter'
import { Onboarding } from '../profile/Onboarding'
import { KeyGate } from '../profile/KeyGate'
import { useKeyGate } from '../profile/KeyCheck'
import { profile as profileStore, useProfile, type Profile } from '../profile/profile'
import { apply, onError as onPlacesError, setKey as setPlacesKey, useNaming, usePlaces } from '../ingest/places'
import { NamingStamp } from './NamingStamp'
import { ReadyBar, readyFor, type Ready } from './ReadyBar'
import { GoogleDownNote } from './GoogleDownNote'
import { useSettings } from '../ingest/settings'
import { useStore } from '../store/useStore'
import { Settings } from './Settings'
import { Crew } from '../crew/Crew'
import { useRooms } from '../crew/useRooms'
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
export const RecordContext = createContext<Record_ | null>(null)
export const useRecord = () => useContext(RecordContext)!

export function App() {
  const [record, setRecord] = useState<Data | null>(null)
  const [mine, setMine] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  // No sample shipped with this build (the data folder is not in git): the front door still takes an import.
  const [noDemo, setNoDemo] = useState(false)
  const [stage, setStage] = useState<string | null>(null)
  const [importError, setImportError] = useState<Error | null>(null)
  const [enrichError, setEnrichError] = useState<Error | null>(null)
  const [ready, setReady] = useState<Ready | null>(null)
  const naming = useNaming()
  const [editing, setEditing] = useState(false)
  const prof = useProfile()
  const { mapsKey } = useSettings()
  const gated = useKeyGate()
  const adopt = useCallback((d: Data, isMine: boolean) => { useStore.getState().setPlayhead(d.meta.range[0]); useStore.getState().setRange(null); setMine(isMine); setRecord(d) }, [])
  useEffect(() => {
    loadData().then(async (d) => adopt(d, !!(await loadRecord().catch(() => undefined)))).catch((e) => (e instanceof DataLoadError ? setNoDemo(true) : setError(e)))
  }, [adopt])
  // The record follows the profile: when home or work moves, trips and days are worked out again.
  const homesKey = JSON.stringify([prof?.homes ?? null, prof?.works ?? null])
  useEffect(() => {
    if (!record || !prof) return
    if (JSON.stringify([record.profile.homes ?? null, record.profile.works ?? null]) === homesKey) return
    let live = true
    const onStage = (s: string) => { setStage(s); setReady(readyFor(s, 'rederive')) }
    rederive(record, prof, onStage).then((d) => { if (!live) return; setStage(null); setRecord({ ...d, paths: record.paths }) }).catch((e) => { if (live) { setStage(null); setReady(null); setImportError(e) } })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.meta.source_sha256, homesKey])
  const tab = useStore((s) => s.tab)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const crewOpen = useStore((s) => s.crewOpen)
  const onMap = (tab === 'map' || tab === 'play') && !settingsOpen && !crewOpen
  useRooms()
  // Remembered per record so a record with no track at all is asked once, not on every render.
  const pathsFor = useRef<string | null>(null)
  useEffect(() => {
    if (!onMap || !record || record.paths.length || pathsFor.current === record.meta.source_sha256) return
    pathsFor.current = record.meta.source_sha256
    let live = true
    setReady({ label: 'Drawing paths', pct: 0 })
    loadPaths(record).then((paths) => { if (live) { setReady({ label: 'Drawing paths', pct: 100 }); setRecord({ ...record, paths }) } }).catch(setError)
    return () => { live = false }
  }, [onMap, record])
  // Names and photos land on top of the record as the shared places store fills, from cache and from lookups the tabs ask for.
  // Lookups wait until onboarding is done (the questions stay free); the baked record counts as yours, so it is named too.
  const spend = !!prof
  useEffect(() => onPlacesError(setEnrichError), [])
  useEffect(() => { setEnrichError(null); setPlacesKey(spend ? mapsKey : '') }, [mapsKey, spend])
  const { cache } = usePlaces()
  const data = useMemo(() => (record ? { ...record, places: apply(record.places, cache, mapsKey) } : null), [record, cache, mapsKey])
  const ctx = useMemo<Record_>(() => ({
    mine, stage, importError, enrichError,
    importFile: (f) => { setImportError(null); const onStage = (s: string) => { setStage(s); setReady(readyFor(s, 'import')) }; ingestFile(f, profileStore.get() ?? PROVISIONAL, onStage).then((d) => { setStage(null); adopt(d, true); if (profileStore.get()) useStore.getState().setTab('home') }).catch((e) => { setStage(null); setReady(null); setImportError(e) }) },
    // Without a bundled sample, starting over lands on the front door, same as a first visit.
    reset: () => { profileStore.set(null); setRecord(null); clearRecord().then(() => loadData()).then((d) => adopt(d, false)).catch((e) => (e instanceof DataLoadError ? setNoDemo(true) : setError(e))) },
    editProfile: () => setEditing(true),
  }), [mine, stage, importError, enrichError, adopt])
  // Chrome tucks away once the first bill has scrolled off; the heads underneath print clean.
  useEffect(() => {
    const onScroll = () => document.body.toggleAttribute('data-scrolled', scrollY > 240)
    addEventListener('scroll', onScroll, { passive: true })
    return () => removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    const onHash = () => useStore.getState().syncFromHash()
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  const goHome = () => { useStore.getState().setTab('home'); scrollTo({ top: 0, behavior: 'smooth' }) }
  const bar = <ReadyBar ready={ready} />
  if (error) return <div className="tray"><LoadFailed error={error} /></div>
  if (!record && noDemo) return <>{bar}<Onboarding key="new" data={null} demo={false} stage={stage} importError={importError} importFile={ctx.importFile} initial={null} /></>
  if (!record) return <div className="tray">{bar}<Printing /></div>
  // A returning visitor's saved key is checked once before the record prints on it; onboarding carries its own check.
  if (prof && !editing && gated) return <div className="tray">{bar}<KeyGate /></div>
  if (!prof || editing) {
    return <>{bar}<Onboarding key={editing ? 'edit' : 'new'} data={data} demo={!mine} stage={stage} importError={importError} importFile={ctx.importFile} initial={editing ? prof : null} onClose={editing ? () => setEditing(false) : undefined} /></>
  }
  return (
    <div className="tray">
      {bar}
      <div className="tourline">
        <button className="home" onClick={goHome} aria-label="Back to the tour"><span className="mark">E</span><span className="caps">Else<b>where</b> · {prof.name ? `${prof.name}'s record` : 'your record'}</span></button>
        <button className="chip" onClick={() => useStore.getState().openSettings()} aria-current={settingsOpen ? 'page' : undefined}>Settings</button>
        <details className="account">
          <summary aria-label="Account">▾</summary>
          <div className="menu">
            <button onClick={ctx.editProfile}>Edit profile</button>
            <button onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); useStore.getState().openSettings() }}>Settings</button>
            <button onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); useStore.getState().openCrew() }}>Crew</button>
            <button onClick={ctx.reset}>{mine ? 'Start over' : 'Set up your record'}</button>
            <UsageRow />
          </div>
        </details>
      </div>
      <StubNav />
      <GoogleDownNote />
      <NamingStamp progress={naming} />
      {data && <RecordContext.Provider value={ctx}><DataContext.Provider value={data}>{settingsOpen ? <Settings /> : crewOpen ? <Crew /> : <><RangeBar /><Screen /></>}</DataContext.Provider></RecordContext.Provider>}
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
        {import.meta.env.DEV && <p className="drop">Run <code>python -m pipeline build timeline.json</code> and reload.</p>}
      </Pass>
    </main>
  )
}
