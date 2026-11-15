import { useEffect, useRef, type RefObject } from 'react'

/** Calls `onVisible` once, the first time the element scrolls near the viewport (straight away where there is no IntersectionObserver). */
export function useInView<T extends Element>(onVisible: () => void, rootMargin = '200px'): RefObject<T | null> {
  const ref = useRef<T>(null)
  const cb = useRef(onVisible)
  cb.current = onVisible
  const fired = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el || fired.current) return
    const fire = () => { if (!fired.current) { fired.current = true; cb.current() } }
    if (typeof IntersectionObserver === 'undefined') { fire(); return }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); fire() } }, { rootMargin })
    io.observe(el)
    return () => io.disconnect()
  }, [rootMargin])
  return ref
}
