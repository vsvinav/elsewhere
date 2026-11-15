import { useStore } from '../store/useStore'
import { TAB_LABEL } from '../app/tabs'
import './origin.css'

/** The ticket stub a door leaves on the map: where the reader came from, and the way back. */
export function OriginTag() {
  const origin = useStore((s) => s.origin)
  const goBack = useStore((s) => s.goBack)
  if (!origin) return null
  const back = () => {
    goBack()
    // The tab prints first, then the page scrolls back to the figure.
    requestAnimationFrame(() => requestAnimationFrame(() => scrollTo({ top: origin.scrollY })))
  }
  return (
    <button type="button" className="origin" onClick={back} aria-label={`Back to ${TAB_LABEL[origin.backTab]}`}>
      <small>From ·</small> {origin.label} <i aria-hidden>✕</i>
    </button>
  )
}
