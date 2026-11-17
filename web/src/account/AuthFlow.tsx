import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { b64, fromHex, hasKeys, replaceKeys, unb64 } from '../crew/keys'
import { settings } from '../ingest/settings'
import { migrate, profile } from '../profile/profile'
import { Stamp } from '../world'
import { AccountError, api, logOut, messageOf, type AccountClient, type AccountInfo } from './client'
import { clientId, signIn, warm } from './google'
import { useAccount } from './store'
import { markUploaded } from './sync'
import { deriveKey, newSalt, openVault, passphraseProblem, PASSPHRASE_MIN } from './vault'
import '../profile/onboarding.css'
import './account.css'

export const COPY = {
  signUp: 'Sign up',
  logIn: 'Log in',
  email: 'Your email',
  emailSub: 'We send a six-digit code. No password, nothing to remember.',
  continue: 'Continue',
  google: 'Continue with Google',
  googleFail: "Google sign-in didn't finish. Try again.",
  codeTitle: 'Check your mail',
  sent: (email: string) => `We sent a code to ${email}`,
  linkToo: 'Open the link in the mail works too.',
  resend: 'Send a new code',
  resent: 'Sent again.',
  setTitle: 'Set a recovery passphrase',
  setSub: `At least ${PASSPHRASE_MIN} characters. It seals a copy of your profile and identity so a new device can pick up where this one left off.`,
  setWarn: "Only you know this. We can't reset it.",
  passphrase: 'Passphrase',
  confirm: 'Confirm passphrase',
  mismatch: "Those don't match.",
  tooShort: `At least ${PASSPHRASE_MIN} characters.`,
  tooEasy: "That one's too easy to guess.",
  unlockTitle: 'Enter your recovery passphrase',
  unlockSub: 'The one you set when you made this account. It opens the vault with your profile and identity.',
  unlock: 'Unlock',
  wrong: "That's not it",
  startOver: 'Start over without my vault',
  deriving: 'Sealing…',
  opening: 'Opening your vault…',
  finishing: 'Signing you in…',
  checking: 'Checking the link…',
  linkTitle: (email: string) => `Log in as ${email}?`,
  switchTitle: (email: string) => `Switch to ${email}?`,
  switchSub: (current: string) => `You are signed in as ${current} on this device. Continuing signs that account out here first.`,
  linkSub: 'This link came from a mail. If you did not ask for it, it may be for someone else\'s account.',
  linkLocal: "Continuing puts this device's record and friends into that account.",
  linkYes: 'Continue',
  linkNo: 'Not me',
  back: 'Back',
  cancel: 'Cancel',
} as const

export type AuthResult = { restored: boolean }

/** Google's four-colour G, as its brand guidelines draw it. */
const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
)

/** The mail link lands on `#auth=<token>`; take the token and clear it from the address bar so a reload does not retry it. */
export function takeAuthToken(loc: { hash: string; pathname: string; search: string } = location, replace: (url: string) => void = (u) => history.replaceState(null, '', u)): string | null {
  const m = /^#auth=([0-9a-f]{64})$/i.exec(loc.hash)
  if (!m) return null
  replace(loc.pathname + loc.search)
  return m[1].toLowerCase()
}
type Step = 'email' | 'code' | 'set' | 'unlock' | 'token'
interface Props {
  mode: 'signup' | 'login'
  /** From `#auth=<token>` in the mail link: confirmed against its address, then finished without a code. */
  token?: string | null
  onDone(r: AuthResult): void
  onClose?(): void
  /** The account already signed in on this device, if any; a link for another one asks to switch. */
  current?: string | null
  client?: AccountClient
  /** Tests skip the slow key derivation. */
  derive?: typeof deriveKey
  /** Google's prompt; null hides the button. Defaults to the real one when a client ID is built in. */
  google?: (() => Promise<{ idToken: string }>) | null
}
const defaultGoogle = () => (clientId() ? signIn : null)

/** Email → code → passphrase (new account) or unlock (one with a vault). The same screens serve sign up and log in. */
export function AuthFlow({ mode, token, onDone, onClose, current, client, derive = deriveKey, google = defaultGoogle() }: Props) {
  const c = useRef(client ?? api()).current
  const [step, setStep] = useState<Step>(token ? 'token' : 'email')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [linkEmail, setLinkEmail] = useState('')
  const [hasLocal, setHasLocal] = useState(false)
  const title = mode === 'signup' ? COPY.signUp : COPY.logIn

  const start = async (e?: FormEvent) => {
    e?.preventDefault()
    const em = email.trim()
    if (!em) return
    setError(''); setNote(''); setBusy(COPY.continue)
    try { await c.start(em); setStep('code') } catch (err) { setError(messageOf(err)) } finally { setBusy('') }
  }
  const resend = async () => {
    setError(''); setNote(''); setBusy(COPY.resend)
    try { await c.start(email.trim()); setNote(COPY.resent) } catch (err) { setError(messageOf(err)) } finally { setBusy('') }
  }
  const landed = async (session: string, account: AccountInfo) => {
    // Whatever this device remembered of a previous vault is for another account or passphrase.
    const a = useAccount.getState()
    a.setKey(null); await a.setSalt(null); await a.setVaultAt(null); await markUploaded(null)
    await a.setSession({ session, id: account.id, email: account.email })
    setEmail(account.email)
    setStep(account.hasVault ? 'unlock' : 'set')
  }
  const finish = async (body: { email: string; code: string } | { token: string }) => {
    setError(''); setBusy(COPY.finishing)
    try { const r = await c.finish(body); await landed(r.session, r.account); return true } catch (err) { setError(messageOf(err)); return false } finally { setBusy('') }
  }
  // Anything short of a session from Google reads as one line, unless the service was unreachable or said slow down.
  const googleIn = async () => {
    if (!google) return
    setError(''); setBusy(COPY.finishing)
    try { const { idToken } = await google(); const r = await c.google(idToken); await landed(r.session, r.account) }
    catch (err) { setError(err instanceof AccountError && (err.status === 0 || err.status === 429) ? messageOf(err) : COPY.googleFail) }
    finally { setBusy('') }
  }
  // A link logs in whoever opens it, so the address behind it is shown first and nothing happens until Continue.
  // A device with a record or identity of its own is told that those follow the account.
  useEffect(() => {
    if (step !== 'token' || !token) return
    setBusy(COPY.checking)
    hasKeys().then((k) => setHasLocal(k || profile.get() !== null), () => setHasLocal(profile.get() !== null))
    c.peek(token).then((r) => setLinkEmail(r.email), (err) => { setError(messageOf(err)); setStep('email') }).finally(() => setBusy(''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { if (google === signIn) warm() }, [google])
  const linkYes = async () => {
    if (!token) return
    if (current) { setBusy(COPY.finishing); await logOut(c) }
    const ok = await finish({ token })
    if (!ok) setStep('email')
  }
  const linkNo = () => { setLinkEmail(''); setStep('email') }

  const setPassphrase = async (p: string) => {
    setError(''); setBusy(COPY.deriving)
    try {
      const salt = newSalt()
      const key = await derive(p, salt)
      const a = useAccount.getState()
      await a.setSalt(b64(salt)); a.setKey(key); await a.setVaultAt(null); markUploaded(null)
      onDone({ restored: false })
    } catch (err) { setError(messageOf(err)); setBusy('') }
  }
  const unlock = async (p: string) => {
    setError(''); setBusy(COPY.opening)
    try {
      const body = await c.getVault()
      if (!body) { setStep('set'); return }
      const key = await derive(p, unb64(body.salt))
      let plain
      try { plain = await openVault(key, body) } catch { setError(COPY.wrong); return }
      await replaceKeys(fromHex(plain.signPriv), fromHex(plain.kxPriv))
      profile.set(migrate(plain.profile))
      if (plain.settings.relayUrl) settings.set({ relayUrl: plain.settings.relayUrl })
      const a = useAccount.getState()
      await a.setSalt(body.salt); a.setKey(key); a.setPending(false); await a.setVaultAt(Date.now()); markUploaded(plain)
      onDone({ restored: true })
    } catch (err) { setError(messageOf(err)) } finally { setBusy('') }
  }
  const startOver = () => { markUploaded(null); onDone({ restored: false }) }

  return (
    <main className="ob acct">
      <section className="bill ob-bill">
        <div className="peel">
          <header className="ob-head">
            <span className="ob-mark" aria-hidden>E</span>
            <span className="caps">{title}</span>
            {onClose && <button className="btn quiet ob-cancel" onClick={onClose}>{COPY.cancel}</button>}
          </header>

          {step === 'token' && linkEmail && (
            <Screen title={current ? COPY.switchTitle(linkEmail) : COPY.linkTitle(linkEmail)} sub={current ? COPY.switchSub(current) : COPY.linkSub}>
              {hasLocal && <p className="acct-note">{COPY.linkLocal}</p>}
              {error && <p className="acct-err" role="alert">{error}</p>}
              <div className="ob-actions">
                <button className="btn" onClick={() => void linkYes()} disabled={!!busy}>{COPY.linkYes}</button>
                <button className="btn quiet ob-back" onClick={linkNo} disabled={!!busy}>{COPY.linkNo}</button>
                {busy && <span className="acct-busy">{busy}</span>}
              </div>
            </Screen>
          )}

          {(step === 'email' || (step === 'token' && !linkEmail)) && (
            <Screen title={COPY.email} sub={COPY.emailSub}>
              {google && step === 'email' && <button className="btn quiet acct-google" onClick={() => void googleIn()} disabled={!!busy}><GoogleMark />{COPY.google}</button>}
              <form className="acct-form" onSubmit={start}>
                <input id="acct-email" className="ob-input" type="email" autoFocus autoComplete="email" inputMode="email" aria-label={COPY.email} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" disabled={step === 'token'} />
                {error && <p className="acct-err" role="alert">{error}</p>}
                <div className="ob-actions">
                  <button className="btn" type="submit" disabled={!!busy || step === 'token' || !email.trim()}>{COPY.continue}</button>
                  {busy && <span className="acct-busy">{busy}</span>}
                </div>
              </form>
            </Screen>
          )}

          {step === 'code' && (
            <Screen title={COPY.codeTitle} sub={COPY.sent(email.trim())}>
              <CodeInput disabled={!!busy} onComplete={(code) => void finish({ email: email.trim(), code })} />
              {error && <p className="acct-err" role="alert">{error}</p>}
              {note && !error && <p className="acct-note" role="status">{note}</p>}
              <p className="acct-note">{COPY.linkToo}</p>
              <div className="ob-actions">
                <button className="acct-link" onClick={resend} disabled={!!busy}>{COPY.resend}</button>
                {busy && <span className="acct-busy">{busy}</span>}
                <button className="btn quiet ob-back" onClick={() => { setError(''); setNote(''); setStep('email') }} disabled={!!busy}>{COPY.back}</button>
              </div>
            </Screen>
          )}

          {step === 'set' && <SetPassphrase busy={busy} error={error} onSubmit={setPassphrase} />}
          {step === 'unlock' && <Unlock busy={busy} error={error} onSubmit={unlock} onStartOver={startOver} />}
        </div>
        <Stamp top="Account" big={step === 'set' || step === 'unlock' ? '2/2' : '1/2'} bottom={mode === 'signup' ? 'sign up' : 'log in'} style={{ position: 'absolute', right: 'var(--gutter)', bottom: 56 }} />
      </section>
    </main>
  )
}

function Screen({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className="ob-q">
      <h2 className="ob-title">{title}</h2>
      {sub && <p className="lede">{sub}</p>}
      {children}
    </div>
  )
}

/** Six boxes that move on as you type and take a pasted code whole; fires once all six digits are in. */
export function CodeInput({ onComplete, disabled }: { onComplete(code: string): void; disabled?: boolean }) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''))
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const fired = useRef('')
  const put = (next: string[], focus: number) => {
    setDigits(next)
    refs.current[Math.min(focus, 5)]?.focus()
    const code = next.join('')
    if (code.length === 6 && fired.current !== code) { fired.current = code; onComplete(code) }
    if (code.length < 6) fired.current = ''
  }
  const onChange = (i: number, raw: string) => {
    const v = raw.replace(/\D/g, '')
    if (!v) { put(digits.map((d, k) => (k === i ? '' : d)), i); return }
    const next = [...digits]
    for (let k = 0; k < v.length && i + k < 6; k++) next[i + k] = v[k]
    put(next, i + v.length)
  }
  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) { e.preventDefault(); put(digits.map((d, k) => (k === i - 1 ? '' : d)), i - 1) }
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus()
  }
  const onPaste = (i: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const v = e.clipboardData.getData('text').replace(/\D/g, '')
    if (!v) return
    e.preventDefault()
    onChange(v.length >= 6 ? 0 : i, v)
  }
  return (
    <div className="acct-code" role="group" aria-label="Six-digit code">
      {digits.map((d, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el }} value={d} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} aria-label={`Digit ${i + 1}`} autoFocus={i === 0} disabled={disabled}
          onChange={(e) => onChange(i, e.target.value)} onKeyDown={(e) => onKey(i, e)} onPaste={(e) => onPaste(i, e)} onFocus={(e) => e.target.select()} />
      ))}
    </div>
  )
}

function SetPassphrase({ busy, error, onSubmit }: { busy: string; error: string; onSubmit(p: string): void }) {
  const [p, setP] = useState('')
  const [q, setQ] = useState('')
  const [touched, setTouched] = useState(false)
  const problem = passphraseProblem(p), mismatch = p.trim() !== q.trim()
  const hint = touched && problem ? (problem === 'short' ? COPY.tooShort : COPY.tooEasy) : touched && mismatch && q ? COPY.mismatch : ''
  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (!problem && !mismatch) onSubmit(p) }
  return (
    <Screen title={COPY.setTitle} sub={COPY.setSub}>
      <form className="acct-form" onSubmit={submit}>
        <p className="acct-quote">{COPY.setWarn}</p>
        <label className="acct-lab" htmlFor="acct-pass">{COPY.passphrase}</label>
        <input id="acct-pass" className="ob-input" type="password" autoFocus autoComplete="new-password" value={p} onChange={(e) => setP(e.target.value)} disabled={!!busy} />
        <label className="acct-lab" htmlFor="acct-pass2">{COPY.confirm}</label>
        <input id="acct-pass2" className="ob-input" type="password" autoComplete="new-password" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setTouched(true)} disabled={!!busy} />
        {(hint || error) && <p className="acct-err" role="alert">{error || hint}</p>}
        <div className="ob-actions">
          <button className="btn" type="submit" disabled={!!busy || !!problem || mismatch}>{COPY.continue}</button>
          {busy && <span className="acct-busy">{busy}</span>}
        </div>
      </form>
    </Screen>
  )
}

function Unlock({ busy, error, onSubmit, onStartOver }: { busy: string; error: string; onSubmit(p: string): void; onStartOver(): void }) {
  const [p, setP] = useState('')
  const submit = (e: FormEvent) => { e.preventDefault(); if (p.trim()) onSubmit(p) }
  return (
    <Screen title={COPY.unlockTitle} sub={COPY.unlockSub}>
      <form className="acct-form" onSubmit={submit}>
        <label className="acct-lab" htmlFor="acct-unlock">{COPY.passphrase}</label>
        <input id="acct-unlock" className="ob-input" type="password" autoFocus autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} disabled={!!busy} />
        {error && <p className="acct-err" role="alert">{error}</p>}
        <div className="ob-actions">
          <button className="btn" type="submit" disabled={!!busy || !p.trim()}>{COPY.unlock}</button>
          {busy && <span className="acct-busy">{busy}</span>}
          <button type="button" className="acct-link ob-back" onClick={onStartOver} disabled={!!busy}>{COPY.startOver}</button>
        </div>
      </form>
    </Screen>
  )
}
