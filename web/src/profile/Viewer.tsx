import { STAGE_LABEL } from '../ingest'
import './onboarding.css'

export const ANDROID_RELEASE = 'https://github.com/vsvinav/elsewhere-android/releases/latest'

interface ImportProps { stage: string | null; importError: Error | null; importFile(f: File): void }

/** The two ways a record reaches the web: the phone that records it, or a Timeline export picked here. */
export function ImportActions({ stage, importError, importFile, label = 'Add a Google Timeline export' }: ImportProps & { label?: string }) {
  return (
    <>
      <div className="ob-actions">
        <a className="btn" href={ANDROID_RELEASE} target="_blank" rel="noopener">Get the Android app</a>
        <ImportButton stage={stage} importFile={importFile} label={label} />
      </div>
      {importError && <div className="ob-error" role="alert">{importError.message}</div>}
    </>
  )
}

/** A quiet button over a hidden file input; while the import runs it reads the stage instead. */
export function ImportButton({ stage, importFile, label }: { stage: string | null; importFile(f: File): void; label: string }) {
  return (
    <label className="btn quiet" aria-busy={!!stage || undefined}>
      <input type="file" accept=".json,application/json" hidden disabled={!!stage} onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = '' }} />
      {stage ? `${STAGE_LABEL[stage] ?? stage}…` : label}
    </label>
  )
}

/** The web door with nothing to print: the phone records, an export backfills. */
export function Viewer(props: ImportProps) {
  return (
    <main className="ob">
      <section className="bill ob-bill">
        <div className="peel">
          <header className="ob-head"><span className="ob-mark" aria-hidden>E</span></header>
          <div className="ob-q">
            <h1 className="ob-title">Your phone keeps the record.</h1>
            <p className="lede">Elsewhere records on Android as you live. The web prints it.</p>
            <ImportActions {...props} />
            <p className="fine">Phone-to-web sync arrives with a later release; until then the web shows what you import here.</p>
          </div>
        </div>
      </section>
    </main>
  )
}
