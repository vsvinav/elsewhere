import { useEffect, useState } from 'react'
import { APIProvider, Map } from '@vis.gl/react-google-maps'
import { checkKey, hintFor } from '../ingest/keycheck'
import { settings, useSettings } from '../ingest/settings'
import { markGoogleDown, useGoogleDown, WHY } from '../map/provider'

const MAP_WAIT = 6_000

/** Is the visitor allowed past the key? Not while a key is typed in but unproven on both APIs and free maps are not yet accepted. */
export const useKeyGate = () => {
  const { mapsKey, keyOk, mapsOk, limited } = useSettings()
  return !!mapsKey && !(keyOk && mapsOk) && !limited
}

/** Verdict on the typed key: checking, accepted, or Google's own words plus what to do, and the way past it. */
export function KeyCheck() {
  const { mapsKey, keyOk, mapsOk, keyError, limited } = useSettings()
  const down = useGoogleDown()
  const [agree, setAgree] = useState(false)

  useEffect(() => {
    if (!mapsKey || keyOk !== null) return
    let live = true
    checkKey(mapsKey).then((p) => { if (live) settings.set({ keyOk: p.ok, keyError: p.ok ? '' : p.message }) })
    return () => { live = false }
  }, [mapsKey, keyOk])
  // Maps JavaScript gets its own probe once Places has passed: a hidden map either draws tiles or names its error.
  const probing = !!mapsKey && keyOk === true && mapsOk === null
  useEffect(() => {
    if (!probing) return
    if (down) { settings.set({ mapsOk: false, keyError: `${WHY[down] ?? down} (${down})` }); return }
    const t = setTimeout(() => settings.set({ mapsOk: false, keyError: `Google did not draw a map in ${MAP_WAIT / 1000} seconds.` }), MAP_WAIT)
    return () => clearTimeout(t)
  }, [probing, down])

  if (!mapsKey) return null
  if (keyOk === null) return <div className="keycheck busy" role="status" aria-busy>Checking your key with Google…</div>
  if (probing) {
    return (
      <div className="keycheck busy" role="status" aria-busy>
        Checking your key with Google… Places ✓ · Maps…
        <div style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} aria-hidden>
          <APIProvider apiKey={mapsKey} onError={markGoogleDown}>
            <Map defaultCenter={{ lat: 0, lng: 0 }} defaultZoom={1} disableDefaultUI gestureHandling="none" onTilesLoaded={() => settings.set({ mapsOk: true, keyError: '' })} />
          </APIProvider>
        </div>
      </div>
    )
  }
  if (keyOk && mapsOk) return <div className="keycheck ok" role="status">Key accepted · Places ✓ · Maps ✓</div>
  const hint = hintFor(keyError)
  const which = keyOk ? 'Maps JavaScript' : 'Places API'
  // A fresh Maps script only loads with the page, so a maps retry starts over.
  const retry = () => { settings.set({ keyOk: null, mapsOk: null, keyError: '', limited: false }); if (keyOk) location.reload() }
  return (
    <div className="keycheck bad" role="alert">
      <div className="kc-head">Key not accepted · {which} refused it</div>
      {keyOk && <div className="kc-sub">Places ✓ · Maps ✗</div>}
      <code className="kc-msg">{keyError}</code>
      {hint && <p className="kc-hint">{hint}</p>}
      <div className="kc-actions">
        <button className="btn" onClick={retry}>Try again</button>
        {limited ? (
          <span className="kc-limited">Continuing with free maps</span>
        ) : (
          <>
            <label className="kc-agree"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I understand maps and place names will be limited</label>
            <button className="btn quiet" disabled={!agree} onClick={() => settings.set({ limited: true })}>Continue with limited maps</button>
          </>
        )}
      </div>
    </div>
  )
}
