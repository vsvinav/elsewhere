// Crew: who is paired with this record, how to pair, and what each friend may see.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSettings } from '../ingest/settings'
import { useProfile } from '../profile/profile'
import { Field } from '../world'
import { currentCode, expiresIn, isExpired, markOffered, parseCode, rotateCode, type ShareCode } from './codes'
import { nextMidnight, useCrew, type Friend, type Grants } from './friends'
import { fingerprint, fromHex, loadKeys, type DeviceKeys } from './keys'
import { KeyError, POLL_MS, claim, friendOf, offer, poll, type Proposal } from './pairing'
import { RelayError, relayClient, type RelayClient } from './relay'
import './crew.css'

export const EMPTY_RELAY = 'Set a relay in Settings to pair.'
export const VIEWER_NOTE = 'Your phone publishes, this browser views.'
export const NO_FRIENDS = 'Nobody yet. Trade codes with a friend and their stamp turns up on your map.'
export const SONAR_COPY = "Ping us both when we're within a mile and neither of us is usually there."
export const CONFIRM_REMOVE = (name: string) => `Remove ${name}? Their key goes here and yours goes there.`
export const TEST_FIRE_COPY = 'Fires on both phones now, ignoring distance. Nothing is recorded.'
export const CONFIRM_COPY = "You'll see each other's city on the map, and Sonar pings you both when you're somewhere new together. Precise location stays off until you turn it on."
export const RELAY_DOWN = "Couldn't reach the relay. Check your connection, or the Relay URL in Settings."
export const PAIR_NOTE = 'A code pairs two devices; it never carries your location or stats. Scanning a QR needs the phone.'

const RELAY_WORDS: Record<number, string> = { 404: 'No such code. Check it and try again.', 410: 'That code was already used. Ask for a new one.', 409: "That's your own code.", 429: 'Too many tries for now. Wait a little.', 401: 'The relay did not accept this browser.' }
export const BAD_KEYS = "Couldn't verify this friend's keys. Ask them for a new code."
export const relayWords = (e: unknown) => (e instanceof KeyError ? BAD_KEYS : e instanceof RelayError ? RELAY_WORDS[e.status] ?? `The relay said ${e.status}.` : RELAY_DOWN)

const GRANT_LABEL: { key: keyof Grants; label: string; sub: string }[] = [
  { key: 'liveCity', label: 'Live · city', sub: 'Which city, roughly where' },
  { key: 'livePrecise', label: 'Live · precise', sub: 'Exact fixes while sharing' },
  { key: 'sonar', label: 'Sonar', sub: SONAR_COPY },
]

const countWord = (n: number) => (n === 0 ? 'no friends yet' : n === 1 ? '1 friend' : `${n} friends`)
const dateOf = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export function Crew({ fetchFn = fetch, pollMs = POLL_MS }: { fetchFn?: typeof fetch; pollMs?: number }) {
  const { relayUrl } = useSettings()
  const friends = useCrew((s) => s.friends)
  const [keys, setKeys] = useState<DeviceKeys | null>(null)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  useEffect(() => { let on = true; loadKeys().then((k) => { if (on) setKeys(k) }); return () => { on = false } }, [])
  // One client per relay and key set: the offer effect below keys on it, so it must not change with every render.
  const client = useMemo(() => (keys && relayUrl ? relayClient(relayUrl, keys, fetchFn) : null), [keys, relayUrl, fetchFn])
  const accept = async () => { if (!keys || !proposal) return; await useCrew.getState().add(friendOf(keys, proposal)); setProposal(null) }
  return (
    <main className="strip crew">
      <div className="caps crew-head">CREW · {countWord(friends.length)}</div>
      <h1>CREW</h1>
      <p className="fine lede">People who can see where you are. Each card shows exactly what that person gets. {VIEWER_NOTE}</p>
      {relayUrl ? (client && keys ? <PairBill client={client} keys={keys} pollMs={pollMs} onProposal={setProposal} /> : null) : <p className="fine crew-status">{EMPTY_RELAY}</p>}
      {proposal && (
        <div className="crew-confirm" role="dialog" aria-label="Confirm pairing">
          <div className="caps">Pair with <b>{proposal.name}</b>?</div>
          <Field label="Their fingerprint">{proposal.fingerprint}</Field>
          <p className="fine">Check these eight letters match on their screen. Nothing is shared until you both say yes.</p>
          <p className="fine">{CONFIRM_COPY}</p>
          <div className="row crew-tools"><button className="btn" onClick={accept}>Yes, pair</button><button className="btn quiet" onClick={() => setProposal(null)}>No</button></div>
        </div>
      )}
      <section className="friends">
        {friends.length === 0 ? <p className="fine">{NO_FRIENDS}</p> : friends.map((f) => <FriendCard key={f.pairId} friend={f} />)}
      </section>
    </main>
  )
}

/** The share code, offered to the relay and polled while this page is open, plus a slot for a friend's code. */
function PairBill({ client, keys, pollMs, onProposal }: { client: RelayClient; keys: DeviceKeys; pollMs: number; onProposal(p: Proposal): void }) {
  const name = useProfile()?.name || 'A friend'
  const [code, setCode] = useState<ShareCode | null>(null)
  // The offer's outcome is remembered against the code it was for, so a fresh code never inherits the last one's 'ok'.
  const [offer_, setOffer] = useState<{ of: string; state: 'pending' | 'ok' | 'failed' }>({ of: '', state: 'pending' })
  const renew = () => rotateCode().then(setCode)
  const propose = (p: Proposal) => { onProposal(p); void renew() }
  useEffect(() => { let on = true; currentCode().then((c) => { if (on) setCode(c) }); return () => { on = false } }, [])
  const [typed, setTyped] = useState('')
  const [status, setStatus] = useState('')
  const [tick, setTick] = useState(Date.now())
  const [pollNote, setPollNote] = useState('')
  const busy = useRef(false)
  const value = code?.value
  const madeAt = code?.madeAt
  const held = !!code?.offeredAt
  useEffect(() => {
    if (!value) return
    const setOffered = (state: 'pending' | 'ok' | 'failed') => setOffer({ of: value, state })
    if (held) { setOffered('ok'); return }
    let on = true
    setOffered('pending')
    // Every POST counts against this device at the relay, so a code is offered once and remembered as held.
    offer(client, keys, value, name).then(
      () => { if (on) { setOffered('ok'); void markOffered({ value, madeAt: code!.madeAt }).then((c) => on && setCode(c)) } },
      (e) => on && setOffered(e instanceof RelayError && e.status === 409 ? 'ok' : 'failed'))
    return () => { on = false }
  // The code is offered once per code; name changes mid-sheet keep the old offer.
  }, [client, keys, value, held])
  const offered = offer_.of === value ? offer_.state : 'pending'
  useEffect(() => {
    if (offered !== 'ok' || !value || madeAt == null) return
    let on = true
    const ask = async () => {
      if (busy.current || isExpired(madeAt, Date.now())) return
      busy.current = true
      try { const p = await poll(client, value); if (on && p) propose(p) } catch (e) { if (on && e instanceof KeyError) setPollNote(BAD_KEYS) } finally { busy.current = false }
    }
    // A claim made while this tab was away is waiting at the relay: ask once now, then on the clock.
    void ask()
    const id = setInterval(async () => { await ask(); if (on) setTick(Date.now()) }, pollMs)
    return () => { on = false; clearInterval(id) }
  // propose is stable in what it does; onProposal comes from a state setter. Keyed on the code's value, so marking it held does not poll again.
  }, [client, value, madeAt, offered, pollMs])
  const share = async () => {
    if (!code) return
    const text = `Pair with me on Elsewhere: ${code.value}`
    if (navigator.share) { try { await navigator.share({ text }) } catch { /* dismissed */ } return }
    await navigator.clipboard?.writeText(code.value)
    setStatus('Code copied.')
  }
  const pair = async () => {
    const c = parseCode(typed)
    if (!c) { setStatus('A code looks like PT-XXX-XXXX.'); return }
    setStatus('')
    try { onProposal(await claim(client, keys, c, name)); setTyped('') } catch (e) { setStatus(relayWords(e)) }
  }
  if (!code) return null
  return (
    <section className="bill pair-bill" aria-label="Pair">
      <div className="peel">
        <div className="caps">Your share code</div>
        <div className="code">{code.value}</div>
        <div className="fine expiry">{offered === 'failed' ? 'The relay did not take this code; try a new one.' : offered === 'pending' ? 'Offering to the relay…' : `Expires in ${expiresIn(code.madeAt, tick)}`}</div>
        <div className="row crew-tools"><button className="btn" onClick={share}>Share code</button><button className="btn quiet" onClick={renew}>New code</button></div>
        <label className="caps" htmlFor="crew-code">Enter a friend's code</label>
        <div className="row crew-tools">
          <input id="crew-code" value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void pair() }} placeholder="PT-XXX-XXXX" spellCheck={false} autoComplete="off" />
          <button className="btn" onClick={pair}>Pair</button>
        </div>
        <p className="fine crew-status">{status || pollNote}</p>
        <p className="fine">{PAIR_NOTE}</p>
      </div>
    </section>
  )
}

function FriendCard({ friend: f }: { friend: Friend }) {
  const { relayUrl } = useSettings()
  const now = Date.now()
  const muted = (f.mutedUntil ?? 0) > now
  const set = (key: keyof Grants, on: boolean) => useCrew.getState().setGrants(f.pairId, key === 'sonar' && on ? { sonar: true, liveCity: true } : { [key]: on })
  const remove = () => { if (window.confirm(CONFIRM_REMOVE(f.name))) void useCrew.getState().remove(f.pairId) }
  return (
    <article className="pass one friend">
      <div className="body">
        <div className="stamp-letter" aria-hidden="true">{f.name[0]?.toUpperCase()}</div>
        <div className="nm">{f.name}</div>
        <div className="fields">
          <Field label="Fingerprint">{fingerprint(fromHex(f.signPub), fromHex(f.kxPub))}</Field>
          <Field label="Paired">{dateOf(f.addedAt)}</Field>
        </div>
        <div className="grants crew-tools">
          {GRANT_LABEL.map((g) => (
            <label key={g.key} className={`grant ${f.grants[g.key] ? 'on' : ''}`}>
              <input type="checkbox" name={g.key} checked={f.grants[g.key]} onChange={(e) => set(g.key, e.target.checked)} />
              <span className="toggle" aria-hidden="true" />
              <span><b>{g.label}</b><small>{g.sub}</small></span>
            </label>
          ))}
        </div>
        <div className="row crew-tools">
          {f.grants.sonar && <button className="chip" onClick={() => useCrew.getState().mute(f.pairId, muted ? undefined : nextMidnight(now))} aria-pressed={muted}>{muted ? 'Muted for today · unmute' : 'Mute Sonar for today'}</button>}
          <button className="btn quiet remove" onClick={remove}>Remove</button>
        </div>
        {f.grants.sonar && relayUrl && (
          <div className="test-fire">
            <button className="btn quiet" onClick={() => useCrew.getState().testFire(f.pairId)}>Test Sonar</button>
            <small className="fine">{TEST_FIRE_COPY}</small>
          </div>
        )}
      </div>
    </article>
  )
}
