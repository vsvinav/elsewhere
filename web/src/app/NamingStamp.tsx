import type { Progress } from '../ingest/places'

/** A small red stamp that turns while Places lookups land, then lifts off. */
export function NamingStamp({ progress }: { progress: Progress }) {
  if (!progress) return null
  return (
    <div className="naming" role="status" aria-live="polite" aria-label={`Naming places, ${progress.done} of ${progress.total}`}>
      <span className="ring" aria-hidden="true" />
      <span className="k">Naming<br />places</span>
      <b>{progress.done}<small>/{progress.total}</small></b>
    </div>
  )
}
