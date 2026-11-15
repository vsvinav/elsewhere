/** Does a Google key work from this page? One free Places call answers before anything is built on it. */
export type Probe = { ok: true } | { ok: false; message: string; hint: string | null }

// Sydney Opera House; with an id-only field mask the call bills as "IDs Only", which is free.
const PROBE = 'https://places.googleapis.com/v1/places/ChIJN1t_tDeuEmsRUsoyG83frY4'
const TIMEOUT = 10_000

/** What to do about the error, in the visitor's words; null when the message says it all. */
export function hintFor(message: string, origin = typeof location !== 'undefined' ? location.origin : 'this site'): string | null {
  const m = message.toLowerCase()
  if (m.includes('referer') || m.includes('referrer')) return `This key is restricted to other websites. In Google Cloud → Credentials → this key, add ${origin}/* to the allowed websites.`
  if (m.includes('not been used in project') || m.includes('is not enabled') || m.includes('is disabled')) return 'Enable Places API (New) in Google Cloud → APIs & Services → Library, then try again.'
  if (m.includes('billing')) return 'Turn on billing for the Google Cloud project; the free monthly credit covers a record like this.'
  if (m.includes('api key not valid') || m.includes('api_key_invalid') || m.includes('invalid')) return 'The key was typed wrong or has been deleted in Google Cloud.'
  if (m.includes('quota') || m.includes('exceeded')) return 'The key has hit a quota you set in Google Cloud; raise it or wait for the day to roll over.'
  return null
}

export async function checkKey(key: string, f: typeof fetch = fetch): Promise<Probe> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT)
  try {
    const r = await f(PROBE, { headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'id' }, signal: ctl.signal })
    if (r.ok) return { ok: true }
    let message = `Google answered ${r.status}`
    try {
      const body = (await r.json()) as { error?: { message?: string; status?: string } }
      if (body.error?.message) message = body.error.message
    } catch { /* not JSON: keep the status line */ }
    return { ok: false, message, hint: hintFor(message) }
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError'
    return { ok: false, message: aborted ? 'Google did not answer in 10 seconds.' : "Couldn't reach Google.", hint: 'Check your connection and try again.' }
  } finally {
    clearTimeout(timer)
  }
}
