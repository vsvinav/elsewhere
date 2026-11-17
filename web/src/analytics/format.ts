export function fmtKm(km: number): string {
  return km >= 1000 ? `${(km / 1000).toFixed(1)}k km` : `${Math.round(km)} km`
}

export function fmtDate(ts: number, tzMin = 0): string {
  const d = new Date((ts + tzMin * 60) * 1000)
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtTime(ts: number, tzMin = 0): string {
  const d = new Date((ts + tzMin * 60) * 1000)
  return d.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' })
}
