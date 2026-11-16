// The two bits of Crew that sit on the Map: the tag for a tapped friend and the Sonar note.
import { useEffect } from 'react'
import { homeAt } from '../profile/profile'
import { useProfile } from '../profile/profile'
import { nextMidnight, useCrew } from './friends'
import { tagLine } from './layer'

export const SONAR_BODY = 'Within a mile of each other, and neither of you is usually around here. Say hi?'
export const TEST_BODY = 'A test from the Crew page. Rings on both phones, nothing recorded.'
const NOTE_MS = 30_000

export function FriendTag() {
  const tag = useCrew((s) => s.tag)
  const friend = useCrew((s) => s.friends.find((f) => f.pairId === tag))
  const fix = useCrew((s) => (tag ? s.fixes[tag] : undefined))
  const prof = useProfile()
  if (!friend || !fix) return null
  const now = Date.now()
  const { line, both } = tagLine(friend, fix, now, prof?.homes.length ? homeAt(prof.homes, now).city : null)
  return (
    <div className="friend-tag" role="status">
      <span className="stamp-letter" aria-hidden="true">{friend.name[0]?.toUpperCase()}</span>
      <span><span className="line">{line}</span>{both && <span className="both">{both}</span>}</span>
      <button onClick={() => useCrew.getState().setTag(null)} aria-label="Close">×</button>
    </div>
  )
}

/** Rings on the map carry the moment; this note carries the words, for half a minute or until dismissed. */
export function SonarNote() {
  const hit = useCrew((s) => s.hit)
  const friend = useCrew((s) => s.friends.find((f) => f.pairId === hit?.pairId))
  useEffect(() => {
    if (!hit) return
    const id = setTimeout(() => { if (useCrew.getState().hit === hit) useCrew.getState().clearHit() }, NOTE_MS)
    return () => clearTimeout(id)
  }, [hit])
  if (!hit || !friend) return null
  const mute = async () => { await useCrew.getState().mute(friend.pairId, nextMidnight(Date.now())); useCrew.getState().clearHit() }
  return (
    <aside className="sonar-note" role="status">
      <h3>Sonar · {hit.test ? `Test ping from ${friend.name}` : `${friend.name} is nearby`}</h3>
      <p>{hit.test ? TEST_BODY : SONAR_BODY}</p>
      <div className="row">
        <button className="btn quiet mute" onClick={mute}>Mute Sonar for today</button>
        <button className="btn" onClick={() => useCrew.getState().clearHit()}>Got it</button>
      </div>
    </aside>
  )
}
