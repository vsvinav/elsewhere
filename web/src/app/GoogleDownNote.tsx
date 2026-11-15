import { useState } from 'react'
import { useGoogleDown, WHY } from '../map/provider'

/** A strip at the top when Google stops serving maps mid-session: the error by name, what it means, and that maps carry on free. */
export function GoogleDownNote() {
  const reason = useGoogleDown()
  const [shut, setShut] = useState<string | null>(null)
  if (!reason || shut === reason) return null
  return (
    <div className="gdown" role="alert">
      <b>Google maps are off</b>
      <span className="why">{WHY[reason] ?? 'Google rejected the key.'} <code>{reason}</code></span>
      <span className="then">Maps print on OpenStreetMap until the key is fixed. Photos and new place names pause too.</span>
      <a href={`https://developers.google.com/maps/documentation/javascript/error-messages#${reason.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`} target="_blank" rel="noreferrer">What Google says</a>
      <button type="button" onClick={() => setShut(reason)} aria-label="Dismiss">×</button>
    </div>
  )
}
