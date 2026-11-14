import type { Hop, Port } from './flights'

export interface Region { name: string; ports: Port[]; hops: Hop[] }
/** Airports gathered into neighbourhoods (anything within ~25° joins), named after the busiest airport. */
export function regions(hops: Hop[], ports: Port[]): Region[] {
  // Single linkage: any airport within ~25° of a member joins, and clusters that touch merge.
  let groups: Port[][] = ports.map((p) => [p])
  const near = (a: Port[], b: Port[]) => a.some((p) => b.some((q) => Math.hypot(q.p[0] - p.p[0], q.p[1] - p.p[1]) < 25))
  for (let merged = true; merged;) {
    merged = false
    outer: for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) if (near(groups[i], groups[j])) {
      groups[i] = [...groups[i], ...groups[j]]; groups.splice(j, 1); merged = true; break outer
    }
  }
  groups = groups.map((g) => [...g].sort((a, b) => b.n - a.n))
  const has = (g: Port[], x: [number, number]) => g.some((q) => Math.abs(q.p[0] - x[0]) < 0.1 && Math.abs(q.p[1] - x[1]) < 0.1)
  return groups
    .map((g) => ({ name: g.find((p) => p.name)?.name ?? 'Somewhere', ports: g, hops: hops.filter((h) => has(g, h.s) && has(g, h.t)) }))
    // A single route is a line, not a map; it stays in the ledger.
    .filter((r) => r.hops.length >= 2)
    .sort((a, b) => b.hops.reduce((s, h) => s + h.n, 0) - a.hops.reduce((s, h) => s + h.n, 0))
}
