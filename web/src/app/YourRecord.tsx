import { useRef, useState, type DragEvent } from 'react'
import { useData } from '../data/DataContext'
import { useRecord } from './App'
import { STAGE_LABEL } from '../ingest'
import { useStore } from '../store/useStore'
import { Field } from '../world'
import { n0 } from '../world/fmt'

/** The last pass on Home: where a visitor's own export goes in. Keys live on the Settings page. */
export function YourRecord() {
  const data = useData()
  const rec = useRecord()
  const openSettings = useStore((s) => s.openSettings)
  const [over, setOver] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const busy = rec.stage !== null
  const named = Object.values(data.places).filter((p) => p.name).length
  const photos = Object.values(data.places).filter((p) => p.photo).length

  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) rec.importFile(f) }

  return (
    <div className={over ? 'drop-over' : ''}>
        <div className="fields" style={{ marginTop: 28 }}>
          <Field label="Source">{rec.mine ? `Your export · ${data.meta.source_file}` : 'Sample record. Add yours below.'}</Field>
          <Field label="Segments">{n0(data.meta.import_report.parsed)} parsed · {n0(data.meta.import_report.segments_total - data.meta.import_report.parsed)} skipped</Field>
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
                <button className="btn quiet" onClick={rec.editProfile}>Edit profile</button>
                {rec.mine && <button className="btn quiet" onClick={rec.reset}>Back to the sample</button>}
              </div>
            </>
          )}
          {rec.importError && <div className="dz-err">Couldn't read that file: {rec.importError.message}</div>}
        </div>

        {rec.enrichError && <div className="dz-err">Places lookups stopped: {rec.enrichError.message}</div>}
        <p className="fine"><button className="link" onClick={openSettings}>Keys live in Settings →</button></p>
    </div>
  )
}
