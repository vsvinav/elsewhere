/** Indices kept by Ramer–Douglas–Peucker at `tol` (same units as the points); endpoints always survive. */
export function simplifyIdx(pts: [number, number][], tol: number): number[] {
  if (pts.length <= 2) return pts.map((_, i) => i)
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  const t2 = tol * tol
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, ay] = pts[a], [bx, by] = pts[b]
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
    let best = -1, bestD = t2
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i]
      const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
      const ex = ax + dx * t - px, ey = ay + dy * t - py
      const d = ex * ex + ey * ey
      if (d > bestD) { bestD = d; best = i }
    }
    if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, b]) }
  }
  const out: number[] = []
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(i)
  return out
}

/** Degrees of longitude per `px` screen pixels at a zoom (Google 256px tiles). */
export const degPerPx = (zoom: number) => 360 / (256 * 2 ** zoom)
