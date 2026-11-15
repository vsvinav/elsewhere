import type { KeyboardEvent, ReactNode } from 'react'
import { useStore, type Door as Target } from '../store/useStore'
import './door.css'

const ariaLabel = (t: Target) => `Open on the map: ${t.label}`

/** A readable figure you can tap: opens the map on the window or the pins that made it. */
export function Door({ target, children, className = '' }: { target: Target; children: ReactNode; className?: string }) {
  const goTo = useStore((s) => s.goTo)
  return <button type="button" className={`door ${className}`} aria-label={ariaLabel(target)} onClick={() => goTo(target)}>{children}</button>
}

/** The same door on an element that has to stay what it is (a list row, a table cell). */
export function doorProps(target: Target) {
  const go = () => useStore.getState().goTo(target)
  return {
    role: 'button' as const, tabIndex: 0, 'aria-label': ariaLabel(target), 'data-door': '',
    onClick: go,
    onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go() } },
  }
}
