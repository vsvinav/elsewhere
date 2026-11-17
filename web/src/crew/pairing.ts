// Pairing: show a code, or enter a friend's, then confirm before anything is saved.
import type { Friend, Grants } from './friends'
import { deviceIdOf, fingerprint, fromHex, kxSigOf, pairIdOf, pairKeyOf, toHex, verifyKxSig, type DeviceKeys } from './keys'
import type { PairRecord, RelayClient } from './relay'

/** The other device as shown on the confirm sheet; nothing is derived or stored until the user says yes. */
export interface Proposal { deviceId: string; name: string; signPub: string; kxPub: string; fingerprint: string }

export const POLL_MS = 3000
const HEX32 = /^[0-9a-f]{64}$/

export const myRecord = (keys: DeviceKeys, name: string) => ({ signPub: toHex(keys.signPub), kxPub: toHex(keys.kxPub), kxSig: kxSigOf(keys), name })

/** Thrown when the other side's record does not hold together; never derive a pair key from one. */
export class KeyError extends Error { constructor(m: string) { super(m); this.name = 'KeyError' } }

/** Refuses a record whose signing key is not the one behind its device id, or whose kx key the signing key did not vouch for. */
export function proposalOf(r: PairRecord): Proposal {
  if (!HEX32.test(r.signPub) || !HEX32.test(r.kxPub) || typeof r.kxSig !== 'string') throw new KeyError('bad keys')
  const pub = fromHex(r.signPub)
  const kx = fromHex(r.kxPub)
  if (deviceIdOf(pub) !== r.deviceId) throw new KeyError('key does not match id')
  if (!verifyKxSig(pub, kx, r.kxSig)) throw new KeyError('kx key not signed by sign key')
  return { deviceId: r.deviceId, name: String(r.name).slice(0, 40) || 'A friend', signPub: r.signPub, kxPub: r.kxPub, fingerprint: fingerprint(pub, kx) }
}

export const offer = (client: RelayClient, keys: DeviceKeys, code: string, name: string) => client.createCode(code, myRecord(keys, name))
export const poll = async (client: RelayClient, code: string) => { const r = await client.pollCode(code); return r ? proposalOf(r) : null }
export const claim = async (client: RelayClient, keys: DeviceKeys, code: string, name: string) => proposalOf(await client.claimCode(code, myRecord(keys, name)))

/** What a new friend gets on confirm: the city and Sonar, so pairing shows something; precise waits for a deliberate switch. */
export const DEFAULT_GRANTS: Grants = { liveCity: true, livePrecise: false, sonar: true }

export function friendOf(keys: DeviceKeys, p: Proposal, now = Date.now()): Friend {
  const pairId = pairIdOf(keys.signPub, fromHex(p.signPub))
  return { deviceId: p.deviceId, name: p.name, signPub: p.signPub, kxPub: p.kxPub, pairId, pairKey: toHex(pairKeyOf(keys.kxPriv, fromHex(p.kxPub), pairId)), addedAt: now, grants: { ...DEFAULT_GRANTS } }
}
