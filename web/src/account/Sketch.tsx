import { useEffect, useId, useState } from 'react'
import { n0 } from '../world/fmt'
import { H, PATH_LENGTH, POINTS, TOTAL, W, pathD, sketchAt } from './route'

const D = pathD()
const GRID = W / 12
const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** A route sketching itself from HOME to five far pins while the kilometres count up. Plays once, then rests. */
export function Sketch() {
  const [frame, setFrame] = useState(() => sketchAt(still() ? TOTAL : 0))
  const id = useId()
  useEffect(() => {
    if (still()) return
    let raf = 0, start = performance.now(), hiddenAt = 0
    const tick = () => {
      const t = performance.now() - start
      setFrame(sketchAt(t))
      raf = t < TOTAL ? requestAnimationFrame(tick) : 0
    }
    const onVisible = () => {
      if (document.hidden) { if (raf) { cancelAnimationFrame(raf); raf = 0; hiddenAt = performance.now() } }
      else if (hiddenAt) { start += performance.now() - hiddenAt; hiddenAt = 0; raf = requestAnimationFrame(tick) }
    }
    document.addEventListener('visibilitychange', onVisible)
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVisible) }
  }, [])
  const at = (p: { x: number; y: number }) => ({ left: `${p.x * 100}%`, top: `${p.y * 100}%` })
  return (
    <div className="sk" aria-hidden>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <pattern id={`${id}g`} width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <path d={`M${GRID} 0H0V${GRID}`} fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </pattern>
          <mask id={`${id}m`} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
            <path d={D} fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" pathLength={PATH_LENGTH} strokeDasharray={PATH_LENGTH} strokeDashoffset={(1 - frame.progress) * PATH_LENGTH} />
          </mask>
        </defs>
        <rect width={W} height={H} fill={`url(#${id}g)`} />
        <path className="sk-route" d={D} mask={`url(#${id}m)`} />
      </svg>
      {POINTS.map((p, i) => i <= frame.stamps && <i key={p.label} className={`sk-stamp${i ? '' : ' red'}`} style={at(p)} />)}
      {POINTS.map((p) => <span key={p.label} className="sk-pin" style={at(p)}><b>{p.label}</b></span>)}
      <div className="sk-count"><span className="sk-km">{n0(frame.km)}</span><span className="caps">Kilometres</span></div>
    </div>
  )
}
