// Sonar rehearsal: a local switch that lets a ping fire at home for a day. The Android twin reads the same setting.

/** How long a rehearsal lasts once switched on. */
export const REHEARSAL_MS = 24 * 3600 * 1000

/** On while the stored deadline is still ahead; 0 or a past deadline is off. */
export const rehearsalOn = (s: { rehearsalUntil: number }, now: number) => s.rehearsalUntil > now

/** The deadline to store when the switch goes on. */
export const rehearsalDeadline = (now: number) => now + REHEARSAL_MS
