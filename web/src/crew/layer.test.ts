import { describe, expect, it } from 'vitest'
import type { ScatterplotLayer } from 'deck.gl'
import { RING_MS, friendLayers, ringRadii, tagLine, type FriendDot } from './layer'
import type { Fix, Friend } from './friends'

const NOW = Date.UTC(2025, 10, 15, 16, 0, 0)
const friend = (pairId: string, name: string): Friend => ({ deviceId: pairId, name, signPub: '', kxPub: '', pairId, pairKey: '', addedAt: 0, grants: { liveCity: true, livePrecise: false, sonar: false } })
const fix = (pairId: string, ageMs: number, city: string | null = 'Lisbon'): Fix => ({ pairId, t: Math.floor((NOW - ageMs) / 1000), lat: 38.7, lng: -9.1, city, grade: 'city', at: NOW - ageMs })
const friends = [friend('M', 'Marta'), friend('K', 'Kenji'), friend('X', 'Gone')]

describe('friendLayers', () => {
  it('stamps each visible friend with an initial, greys the stale and drops the old', () => {
    const fixes = { M: fix('M', 60_000), K: fix('K', 20 * 60_000), X: fix('X', 25 * 3600_000) }
    const layers = friendLayers(fixes, friends, NOW, null)
    expect(layers.map((l) => l.id)).toEqual(['friends', 'friend-initials'])
    const stamps = layers[0] as ScatterplotLayer<FriendDot>
    const data = stamps.props.data as FriendDot[]
    expect(data.map((d) => [d.initial, d.stale])).toEqual([['M', false], ['K', true]])
    const fill = stamps.props.getFillColor as unknown as (d: FriendDot) => number[]
    expect(fill(data[0])).toEqual([233, 181, 49, 255])
    expect(fill(data[1])[0]).toBeLessThan(200)
    expect(data[0].friend).toBe(true)
  })
  it('a fresh hit adds two rings around that friend for 1.2 s, then they go', () => {
    const fixes = { M: fix('M', 1000) }
    const hit = { pairId: 'M', id: 'M:1', at: NOW }
    expect(RING_MS).toBe(1200)
    expect(friendLayers(fixes, friends, NOW + 300, hit).map((l) => l.id)).toEqual(['friends', 'friend-initials', 'sonar-rings'])
    expect(friendLayers(fixes, friends, NOW + RING_MS + 1, hit).map((l) => l.id)).toEqual(['friends', 'friend-initials'])
    expect(friendLayers(fixes, friends, NOW + 300, { ...hit, pairId: 'nobody' }).map((l) => l.id)).toEqual(['friends', 'friend-initials'])
  })
  it('ring radii grow outward and the second trails the first', () => {
    const [a0, b0] = ringRadii(0)
    const [a1, b1] = ringRadii(1)
    expect(a0).toBeLessThan(a1); expect(b0).toBeLessThanOrEqual(a0); expect(b1).toBeLessThan(a1)
  })
  it('the tag reads like a person and notes a shared city', () => {
    expect(tagLine(friends[0], fix('M', 180_000), NOW, 'Lisbon')).toEqual({ line: 'Marta · Lisbon · 3 min ago', both: "You're both in Lisbon" })
    expect(tagLine(friends[0], fix('M', 10_000, null), NOW, 'Porto')).toEqual({ line: 'Marta · just now', both: null })
  })
})
