// Keeps a socket open to each friend's room while the Map is showing, so stamps move as pings arrive.
import { useEffect } from 'react'
import { useSettings } from '../ingest/settings'
import { useStore } from '../store/useStore'
import { sealFor, useCrew, type Friend, type Message } from './friends'
import { deviceIdOf, loadKeys, type DeviceKeys, type Envelope } from './keys'
import { connectRooms, relayClient } from './relay'

interface Deps { WS?: typeof WebSocket; fetchFn?: typeof fetch }

/** Opens the rooms, seeds each from `/last`, and returns a stop. Pure of React so it can be driven in a test. */
export function startRooms(base: string, keys: DeviceKeys, friends: Friend[], deps: Deps = {}) {
  const me = deviceIdOf(keys.signPub)
  const receive = (e: Envelope) => useCrew.getState().receive(e)
  const rooms = connectRooms({ base, keys, pairIds: friends.map((f) => f.pairId), onEnvelope: receive, WS: deps.WS })
  const client = relayClient(base, keys, deps.fetchFn)
  let on = true
  for (const f of friends) client.last(f.pairId).then((envs) => { if (on) for (const e of envs) if (e.from !== me) receive(e) }, () => { /* the room may not exist yet */ })
  const send = (pairId: string, m: Message) => {
    const f = useCrew.getState().friends.find((x) => x.pairId === pairId)
    if (!f) return
    const env = sealFor(f, me, m)
    if (rooms.send(pairId, env)) return
    // No live socket (Crew open, or a reconnect in flight): dial once just to drop the message.
    const once = connectRooms({ base, keys, pairIds: [pairId], onEnvelope: () => {}, WS: deps.WS })
    setTimeout(() => { once.send(pairId, env); once() }, 1500)
  }
  useCrew.getState().setSender(send)
  return () => { on = false; rooms(); useCrew.getState().setSender(null) }
}

export function useRooms(deps: Deps = {}) {
  const { relayUrl } = useSettings()
  const tab = useStore((s) => s.tab)
  const overlay = useStore((s) => s.crewOpen)
  const loaded = useCrew((s) => s.loaded)
  const friends = useCrew((s) => s.friends)
  const pairKey = friends.map((f) => f.pairId).join(',')
  useEffect(() => { if (!loaded) void useCrew.getState().load() }, [loaded])
  useEffect(() => {
    if (!relayUrl || !pairKey || (tab !== 'map' && !overlay)) return
    let stop: (() => void) | undefined
    let on = true
    loadKeys().then((keys) => { if (on) stop = startRooms(relayUrl, keys, useCrew.getState().friends, deps) })
    return () => { on = false; stop?.() }
  // deps are injected once by tests and never change at runtime.
  }, [relayUrl, pairKey, tab, overlay])
}
