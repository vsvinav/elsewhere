/**
 * The sonar ping: two sines (C6, then G6 a tenth of a second later), a 3 % downward glide, a light low-pass, one soft
 * feedback echo, hard fade by 1.2 s. `web/scripts/render-sonar.mjs` renders the same recipe offline for the Android asset.
 */
export const PING_MS = 1200

export function playSonar(ctx: BaseAudioContext, at = ctx.currentTime) {
  const out = ctx.createGain(); out.gain.value = 0.5
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000; lp.Q.value = 0.7
  const delay = ctx.createDelay(1); delay.delayTime.value = 0.18
  const fb = ctx.createGain(); fb.gain.value = 0.32
  const wet = ctx.createGain(); wet.gain.value = 0.25
  lp.connect(out); lp.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(out); out.connect(ctx.destination)
  const tone = (f: number, t0: number, hold: number, decay: number, level: number) => {
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f * 0.97, t0 + hold + decay)
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(level, t0 + 0.004)
    g.gain.setValueAtTime(level, t0 + hold); g.gain.exponentialRampToValueAtTime(level * 0.001, t0 + hold + decay)
    o.connect(g); g.connect(lp); o.start(t0); o.stop(t0 + hold + decay + 0.05)
  }
  tone(1046, at, 0.09, 0.70, 1.0)
  tone(1568, at + 0.11, 0.06, 0.90, 0.7)
  out.gain.setValueAtTime(0.5, at + 1.1); out.gain.linearRampToValueAtTime(0, at + 1.2)
}

let shared: AudioContext | undefined
/** Sound only for a tab the reader is looking at; a background tab shows the rings and stays quiet. */
export function sonarHeard(doc: Pick<Document, 'hasFocus'> = document, make: () => AudioContext = () => (shared ??= new AudioContext()), play = playSonar): boolean {
  if (!doc.hasFocus()) return false
  const ctx = make()
  if (ctx.state === 'suspended') ctx.resume().catch(() => undefined)
  play(ctx)
  return true
}
