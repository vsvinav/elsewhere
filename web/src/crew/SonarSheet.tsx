// The hit moment: a sheet over the app when Sonar fires or echoes, with a way to take a photo together.
import { createPortal } from 'react-dom'
import { SnapButton, type SnapPlace } from '../photos/Snap'
import { useCrew, type Fix, type Friend, type Hit } from './friends'

export { SHEET_QUIET_MS, SHEET_SEEN_LS, resetSheetSeenForTest } from './friends'
export const SNAP_TOGETHER = 'Snap a photo together'
export const sheetTitle = (name: string) => `${name} is within a mile`
export const sheetLine = (name: string, rehearsal: boolean) => (rehearsal ? `Rehearsal ping — ${name} is within a mile.` : 'Neither of you is usually here. Say hi?')

/** Where the photo is filed: under this hit, at the friend's fix, which is within a mile of here. */
const placeOf = (friend: Friend, fix: Fix, hit: Hit): SnapPlace => ({ id: `sonar:${hit.id}`, lat: fix.lat, lng: fix.lng, name: fix.city ?? `With ${friend.name}`, city: fix.city })

export function SonarSheet() {
  const hit = useCrew((s) => s.sheetHit)
  const friend = useCrew((s) => s.friends.find((f) => f.pairId === hit?.pairId))
  const fix = useCrew((s) => (hit ? s.fixes[hit.pairId] : undefined))
  const dismiss = useCrew((s) => s.dismissSheet)
  if (!hit || !friend) return null
  const rehearsal = hit.rehearsal === true
  // Taking the photo leaves the sheet up to hold the camera and the card; only Dismiss puts it away.
  return createPortal(
    <div className="snap-veil sonar-veil" role="dialog" aria-modal aria-label="Sonar" onClick={() => dismiss()}>
      <div className="snap-sheet sonar-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="caps">Sonar</div>
        <h2>{sheetTitle(friend.name)}{rehearsal && <span className="rehearsal">REHEARSAL</span>}</h2>
        <p>{sheetLine(friend.name, rehearsal)}</p>
        <div className="row">
          {fix && <SnapButton place={placeOf(friend, fix, hit)} caption={`with ${friend.name}`}>{SNAP_TOGETHER}</SnapButton>}
          <button type="button" className="btn quiet" onClick={() => dismiss()}>Dismiss</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
