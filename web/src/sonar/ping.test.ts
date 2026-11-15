import { describe, expect, it, vi } from 'vitest'
import { PING_MS, playSonar, sonarHeard } from './ping'

const node = () => { const n = { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), gain: param(), frequency: param(), Q: param(), delayTime: param(), type: '' }; return n }
const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() })
const fakeCtx = () => {
  const oscillators: ReturnType<typeof node>[] = []
  const ctx = { currentTime: 10, state: 'running', destination: {}, resume: vi.fn(), createGain: node, createBiquadFilter: node, createDelay: node, createOscillator: () => { const o = node(); oscillators.push(o); return o } }
  return { ctx: ctx as unknown as AudioContext, oscillators }
}

describe('playSonar', () => {
  it('schedules two tones from `at`, the second 110 ms later, and is over by 1.2 s', () => {
    const { ctx, oscillators } = fakeCtx()
    playSonar(ctx, 10)
    expect(oscillators).toHaveLength(2)
    expect(oscillators[0].start).toHaveBeenCalledWith(10)
    expect(oscillators[1].start).toHaveBeenCalledWith(10.11)
    expect(oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(1046, 10)
    expect(oscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(1568, 10.11)
    expect(PING_MS).toBe(1200)
  })
})

describe('sonarHeard', () => {
  it('plays when the document has focus', () => {
    const play = vi.fn()
    const { ctx } = fakeCtx()
    expect(sonarHeard({ hasFocus: () => true }, () => ctx, play)).toBe(true)
    expect(play).toHaveBeenCalledWith(ctx)
  })
  it('stays silent, and never makes a context, when unfocused', () => {
    const play = vi.fn(), make = vi.fn()
    expect(sonarHeard({ hasFocus: () => false }, make, play)).toBe(false)
    expect(play).not.toHaveBeenCalled()
    expect(make).not.toHaveBeenCalled()
  })
})
