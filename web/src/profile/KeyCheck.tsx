import { useEffect, useState } from 'react'
import { checkKey, hintFor } from '../ingest/keycheck'
import { settings, useSettings } from '../ingest/settings'

/** Is the visitor allowed past the key? Not while a key is typed in but unproven and free maps are not yet accepted. */
export const useKeyGate = () => {
  const { mapsKey, keyOk, limited } = useSettings()
  return !!mapsKey && keyOk !== true && !limited
}

/** Verdict on the typed key: checking, accepted, or Google's own words plus what to do, and the way past it. */
export function KeyCheck() {
  const { mapsKey, keyOk, keyError, limited } = useSettings()
  const [agree, setAgree] = useState(false)

  useEffect(() => {
    if (!mapsKey || keyOk !== null) return
    let live = true
    checkKey(mapsKey).then((p) => { if (live) settings.set({ keyOk: p.ok, keyError: p.ok ? '' : p.message }) })
    return () => { live = false }
  }, [mapsKey, keyOk])

  if (!mapsKey) return null
  if (keyOk === null) return <div className="keycheck busy" role="status" aria-busy>Checking your key with Google…</div>
  if (keyOk) return <div className="keycheck ok" role="status">Key accepted · Places ✓ · map tiles are checked when the first map prints</div>
  const hint = hintFor(keyError)
  return (
    <div className="keycheck bad" role="alert">
      <div className="kc-head">Key not accepted</div>
      <code className="kc-msg">{keyError}</code>
      {hint && <p className="kc-hint">{hint}</p>}
      <div className="kc-actions">
        <button className="btn" onClick={() => settings.set({ keyOk: null, keyError: '', limited: false })}>Try again</button>
        {limited ? (
          <span className="kc-limited">Continuing with free maps</span>
        ) : (
          <>
            <label className="kc-agree"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I understand: OpenStreetMap tiles, no place names or photos</label>
            <button className="btn quiet" disabled={!agree} onClick={() => settings.set({ limited: true })}>Continue with limited maps</button>
          </>
        )}
      </div>
    </div>
  )
}
