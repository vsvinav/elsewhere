// Renders the sonar ping offline to a 48 kHz mono WAV, then (when ffmpeg is on the PATH) to the Android asset
// app/src/main/res/raw/sonar.ogg. Same recipe as src/sonar/ping.ts; keep the two in step.
//   node scripts/render-sonar.mjs [out.wav] [out.ogg]
import { OfflineAudioContext } from 'node-web-audio-api'
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const RATE = 48000, FRAMES = 57600

function playSonar(ctx, at = ctx.currentTime) {
  const out = ctx.createGain(); out.gain.value = 0.5
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000; lp.Q.value = 0.7
  const delay = ctx.createDelay(1); delay.delayTime.value = 0.18
  const fb = ctx.createGain(); fb.gain.value = 0.32
  const wet = ctx.createGain(); wet.gain.value = 0.25
  lp.connect(out); lp.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(out); out.connect(ctx.destination)
  const tone = (f, t0, hold, decay, level) => {
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

function wav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8)
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34)
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40)
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2)
  return buf
}

const [wavPath = 'sonar.wav', oggPath = 'sonar.ogg'] = process.argv.slice(2)
const ctx = new OfflineAudioContext(1, FRAMES, RATE)
playSonar(ctx, 0)
const rendered = await ctx.startRendering()
const pcm = rendered.getChannelData(0)
// The asset is normalised to the −6 dBFS peak the notification channel expects.
const PEAK = Math.pow(10, -6 / 20)
let peak = 0
for (const s of pcm) peak = Math.max(peak, Math.abs(s))
for (let i = 0; i < pcm.length; i++) pcm[i] *= PEAK / peak
writeFileSync(wavPath, wav(pcm))
console.log(`${wavPath}: ${pcm.length} frames, peak ${(20 * Math.log10(PEAK)).toFixed(1)} dBFS`)
const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wavPath, '-c:a', 'libvorbis', '-q:a', '5', oggPath], { stdio: 'inherit' })
if (ff.error) console.log(`ffmpeg not found; run: ffmpeg -y -i ${wavPath} -c:a libvorbis -q:a 5 ${oggPath}`)
else console.log(`${oggPath} written; copy to app/src/main/res/raw/sonar.ogg in the Android repo`)
