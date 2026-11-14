import { useRef, useState, type DragEvent } from 'react'
import { useData } from '../data/DataContext'
import { useRecord } from './App'
import { STAGE_LABEL } from '../ingest'
import { settings, useSettings } from '../ingest/settings'
import { Field, Pass, PrintIn } from '../world'
import { date, n0 } from '../world/fmt'

/** The last pass on Home: where a visitor's own export goes in, and where their Google key lives. */
export function YourRecord() {
  const data = useData()
  const rec = useRecord()
  const { mapsKey, mapId } = useSettings()
  const [over, setOver] = useState(false)
  const [key, setKey] = useState(mapsKey)
  const [id, setId] = useState(mapId)
  const [showKey, setShowKey] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const busy = rec.stage !== null
  const named = Object.values(data.places).filter((p) => p.name).length
  const photos = Object.values(data.places).filter((p) => p.photo).length

  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) rec.importFile(f) }
  const saveKeys = () => {
    const changed = key !== mapsKey || id !== mapId
    settings.set({ mapsKey: key.trim(), mapId: id.trim() })
    // The Maps script loads once per page with one key; a new key needs a fresh page.
    if (changed && 'google' in window) location.reload()
  }

  return (
    <Pass share={false} className={over ? 'drop-over' : ''} stub={
      <PrintIn>
        <Field label="Source">{rec.mine ? 'Your export' : 'Sample record'}</Field>
        <Field label="File">{data.meta.source_file}</Field>
        <Field label="Segments" big>{n0(data.meta.import_report.parsed)}</Field>
        <Field label="Skipped">{n0(data.meta.import_report.segments_total - data.meta.import_report.parsed)}</Field>
      </PrintIn>
    }>
      <PrintIn>
        <div className="fields">
          <Field label="Your record">{rec.mine ? `Printed from ${data.meta.source_file}` : 'Showing the sample. Add yours below.'}</Field>
          <Field label="Kept">In this browser only</Field>
          <Field label="Named">{named} places{photos ? ` · ${photos} with photos` : ''}</Field>
        </div>

        <div className={`dropzone${over ? ' over' : ''}${busy ? ' busy' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) rec.importFile(f); e.target.value = '' }} />
          {busy ? (
            <>
              <div className="dz-title">{STAGE_LABEL[rec.stage!] ?? rec.stage}…</div>
              <div className="dz-sub">Big exports take a few seconds. Nothing is uploaded.</div>
            </>
          ) : (
            <>
              <div className="dz-title">Drop your Timeline export here</div>
              <div className="dz-sub">Android: Settings → Location → Timeline → Export. iPhone: Google Maps → your photo → Your timeline → ⋯ → Export. It's a <code>Timeline.json</code>.</div>
              <div className="dz-actions">
                <button className="btn" onClick={() => file.current?.click()}>Choose file</button>
                {rec.mine && <button className="btn quiet" onClick={rec.reset}>Back to the sample</button>}
              </div>
            </>
          )}
          {rec.importError && <div className="dz-err">Couldn't read that file: {rec.importError.message}</div>}
        </div>

        <div className="fields keys">
          <div className="field">
            <div className="lab">Google Maps key</div>
            <input className="val" type={showKey ? 'text' : 'password'} value={key} onChange={(e) => setKey(e.target.value)} onFocus={() => setShowKey(true)} onBlur={() => { setShowKey(false); saveKeys() }} placeholder="AIza…" aria-label="Google Maps API key" spellCheck={false} autoComplete="off" />
          </div>
          <div className="field">
            <div className="lab">Map ID (optional, vector tiles)</div>
            <input className="val" value={id} onChange={(e) => setId(e.target.value)} onBlur={saveKeys} placeholder="none" aria-label="Google Map ID" spellCheck={false} autoComplete="off" />
          </div>
          <Field label="Used for">Map tiles · place names · photos</Field>
        </div>
        {rec.enrichError && <div className="dz-err">Places lookups stopped: {rec.enrichError.message}</div>}
        <p className="fine">The key stays in this browser. Enable Maps JavaScript API and Places API (New) on it; restrict it to this site's address. Record {date(data.meta.range[0])} → {date(data.meta.range[1])}.</p>
      </PrintIn>
    </Pass>
  )
}
