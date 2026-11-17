// The hit moment: a sheet over the app when Sonar fires or echoes, with a way to take a photo together.
import { useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useSettings } from '../ingest/settings'
import { SnapButton, type SnapPlace } from '../photos/Snap'
import { rehearsalOn } from '../sonar/rehearsal'
import { useCrew, type Fix, type Friend } from './friends'

export const SNAP_TOGETHER = 'Snap a photo together'
export const sheetTitle = (name: string) => `${name} is within a mile`
export const sheetLine = (name: string, rehearsal: boolean) => (rehearsal ? `Rehearsal ping — ${name} is within a mile.` : 'Neither of you is usually here. Say hi?')

/** Hit ids whose sheet was already put away, newest last; a reload or a re-seeded room must not raise it again. */
export const SHEET_SEEN_LS = 'sonar:sheetSeen'
const KEEP = 64
const subs = new Set<() => void>()
const read = (): string[] => { try { const v = JSON.parse(localStorage.getItem(SHEET_SEEN_LS) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [] } catch { return [] } }
let seen = read()
const markSeen = (id: string) => {
  if (seen.includes(id)) return
  seen = [...seen, id].slice(-KEEP)
  try { localStorage.setItem(SHEET_SEEN_LS, JSON.stringify(seen)) } catch { /* private mode */ }
  subs.forEach((f) => f())
}
export const resetSheetSeenForTest = () => { seen = [] }
const useSeen = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => seen)

/** Where the photo is filed: the friend's fix, which is within a mile of here, under the pair rather than a stop. */
const placeOf = (friend: Friend, fix: Fix): SnapPlace => ({ id: `crew:${friend.pairId}`, lat: fix.lat, lng: fix.lng, name: fix.city ?? `With ${friend.name}`, city: fix.city })

export function SonarSheet() {
  const hit = useCrew((s) => s.hit)
  const friend = useCrew((s) => s.friends.find((f) => f.pairId === hit?.pairId))
  const fix = useCrew((s) => (hit ? s.fixes[hit.pairId] : undefined))
  const st = useSettings()
  const done = useSeen()
  // Taking the photo files the id straight away, but the sheet stays up to hold the camera and the card until Dismiss.
  const [snapping, setSnapping] = useState<string | null>(null)
  if (!hit || hit.test || !friend || (done.includes(hit.id) && snapping !== hit.id)) return null
  const dismiss = () => { setSnapping(null); markSeen(hit.id) }
  const snap = () => { setSnapping(hit.id); markSeen(hit.id) }
  return createPortal(
    <div className="snap-veil sonar-veil" role="dialog" aria-modal aria-label="Sonar" onClick={dismiss}>
      <div className="snap-sheet sonar-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="caps">Sonar</div>
        <h2>{sheetTitle(friend.name)}</h2>
        <p>{sheetLine(friend.name, rehearsalOn(st, Date.now()))}</p>
        <div className="row">
          {fix && <SnapButton place={placeOf(friend, fix)} caption={`with ${friend.name}`} onStart={snap}>{SNAP_TOGETHER}</SnapButton>}
          <button type="button" className="btn quiet" onClick={dismiss}>Dismiss</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
