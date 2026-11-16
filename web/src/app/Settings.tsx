import { useState, type FormEvent } from 'react'
import { useRecord } from './App'
import { DEFAULT_BASE_URL, DEFAULT_MODEL, TEST_PROMPT, askLlm, modelOf, type LlmProvider } from '../ask/llm'
import { DEFAULT_ACCOUNT, DEFAULT_RELAY, settings, useSettings, type MapProvider } from '../ingest/settings'
import { api, deleteAccount, logOut, messageOf } from '../account/client'
import { useAccount } from '../account/store'
import { uploadVault, vaultStatus, type VaultStatus } from '../account/sync'
import { b64, unb64 } from '../crew/keys'
import { deriveKey, newSalt, openVault, passphraseProblem, PASSPHRASE_MIN } from '../account/vault'
import { profile, useProfile } from '../profile/profile'
import { KeyCheck } from '../profile/KeyCheck'
import { ImportButton } from '../profile/Viewer'
import { useStore } from '../store/useStore'
import { UsageRow } from '../usage/Meter'
import { Field } from '../world'
import './settings.css'

export const SETTINGS_TITLE = 'SETTINGS'
export const SECTION = { maps: 'GOOGLE MAPS', ask: 'ASK ELSEWHERE', crew: 'CREW', account: 'ACCOUNT', units: 'UNITS', data: 'DATA' } as const
export const RELAY_CAPTION = 'Friends pair and share through this relay. It holds only device ids and encrypted pings; leave it empty to turn Crew off.'
export const ACCOUNT = {
  signIn: 'Log in or sign up',
  signedOut: 'An account keeps a sealed copy of your profile and identity, so a new device can pick up where this one left off.',
  caption: 'The account service holds your email and a vault only your passphrase opens. The record itself stays in this browser.',
  fresh: 'Recovery vault: up to date',
  stale: 'Recovery vault: out of date',
  empty: 'Recovery vault: nothing to keep yet',
  wrong: "That's not it",
  tooShort: `At least ${PASSPHRASE_MIN} characters.`,
  tooEasy: "That one's too easy to guess.",
  update: 'Update',
  updateHint: 'Enter your recovery passphrase to seal the latest copy.',
  logOut: 'Log out',
  del: 'Delete account',
  delConfirm: 'Delete your account? The vault on the service goes with it. Your record and profile stay in this browser.',
  url: 'Account service URL',
} as const
export const PROVIDER_LABEL: Record<LlmProvider, string> = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini', custom: 'Ollama / custom' }
export const LLM_CAPTION = 'Your key is stored in this browser only and is sent straight to the provider you choose.'
export const NO_KEY_STATUS = 'Add a key first'
export const CLEAR_LABEL = "Clear this browser's record"
export const IMPORT_LABEL = 'Add a Timeline export'
export const CLEAR_CONFIRM = "Clear this browser's record? Your import and profile go; this page's keys stay."

/** Everything a visitor configures, on one page over the tour. Keys never leave the browser. */
export function Settings({ fetchFn = fetch }: { fetchFn?: typeof fetch }) {
  const close = useStore((s) => s.closeSettings)
  return (
    <main className="strip settings">
      <button className="btn quiet back" onClick={close}>← Back</button>
      <h1>{SETTINGS_TITLE}</h1>
      <MapsSection />
      <AskSection fetchFn={fetchFn} />
      <CrewSection />
      <AccountSection onSignIn={() => useAccount.getState().setShowWelcome(true)} fetchFn={fetchFn} />
      <UnitsSection />
      <DataSection />
    </main>
  )
}

function MapsSection() {
  const { mapsKey, mapId, mapProvider } = useSettings()
  const rec = useRecord()
  const [key, setKey] = useState(mapsKey)
  const [id, setId] = useState(mapId)
  const [showKey, setShowKey] = useState(false)
  const save = () => {
    const changed = key !== mapsKey || id !== mapId
    settings.setKey(key.trim()); settings.set({ mapId: id.trim() })
    // The Maps script loads once per page with one key; a new key needs a fresh page. The check result is kept in settings, so it survives.
    if (changed && 'google' in window) location.reload()
  }
  return (
    <section className="setting">
      <h2>{SECTION.maps}</h2>
      <div className="fields keys">
        <div className="field">
          <label className="lab" htmlFor="st-maps-key">API key</label>
          <input id="st-maps-key" className="val" type={showKey ? 'text' : 'password'} value={key} onChange={(e) => setKey(e.target.value)} onFocus={() => setShowKey(true)} onBlur={() => { setShowKey(false); save() }} placeholder="AIza…" spellCheck={false} autoComplete="off" />
        </div>
        <div className="field">
          <label className="lab" htmlFor="st-map-id">Map ID · optional</label>
          <input id="st-map-id" className="val" value={id} onChange={(e) => setId(e.target.value)} onBlur={save} placeholder="none" spellCheck={false} autoComplete="off" />
        </div>
        <div className="field">
          <label className="lab" htmlFor="st-map-tiles">Map provider</label>
          <select id="st-map-tiles" className="val" value={mapProvider} onChange={(e) => settings.set({ mapProvider: e.target.value as MapProvider })}>
            <option value="auto">Auto</option>
            <option value="google">Google</option>
            <option value="osm">OpenStreetMap</option>
          </select>
        </div>
        <Field label="Key used for">Map tiles · place names · photos</Field>
        <KeyCheck />
        <UsageRow />
      </div>
      {rec.enrichError && <div className="dz-err">Places lookups stopped: {rec.enrichError.message}</div>}
      <p className="fine">The key stays in this browser. Enable Maps JavaScript API and Places API (New) on it; if you restrict it to websites, add this site's address. The same key works on the phone app only without a website restriction.</p>
    </section>
  )
}

function AskSection({ fetchFn }: { fetchFn: typeof fetch }) {
  const { llm } = useSettings()
  const [showKey, setShowKey] = useState(false)
  const [status, setStatus] = useState<{ busy: boolean; text: string }>({ busy: false, text: '' })
  const patch = (p: Partial<typeof llm>) => settings.set({ llm: { ...llm, ...p } })
  const test = async () => {
    if (llm.provider !== 'custom' && !llm.key.trim()) { setStatus({ busy: false, text: NO_KEY_STATUS }); return }
    setStatus({ busy: true, text: 'Testing…' })
    try { await askLlm(llm, TEST_PROMPT, fetchFn); setStatus({ busy: false, text: `Connected · ${modelOf(llm)}` }) }
    catch (e) { setStatus({ busy: false, text: e instanceof Error ? e.message : String(e) }) }
  }
  return (
    <section className="setting">
      <h2>{SECTION.ask}</h2>
      <div className="fields keys">
        <div className="field">
          <label className="lab" htmlFor="st-llm-provider">Provider</label>
          <select id="st-llm-provider" className="val" value={llm.provider} onChange={(e) => patch({ provider: e.target.value as LlmProvider })}>
            {(Object.keys(PROVIDER_LABEL) as LlmProvider[]).map((p) => <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="lab" htmlFor="st-llm-key">{llm.provider === 'custom' ? 'API key · optional' : 'API key'}</label>
          <span className="val-row">
            <input id="st-llm-key" className="val" type={showKey ? 'text' : 'password'} value={llm.key} onChange={(e) => patch({ key: e.target.value })} spellCheck={false} autoComplete="off" />
            <button type="button" className="show" aria-pressed={showKey} onClick={() => setShowKey((v) => !v)}>{showKey ? 'Hide' : 'Show'}</button>
          </span>
        </div>
        <div className="field">
          <label className="lab" htmlFor="st-llm-model">Model</label>
          <input id="st-llm-model" className="val" value={llm.model} onChange={(e) => patch({ model: e.target.value })} placeholder={DEFAULT_MODEL[llm.provider]} spellCheck={false} autoComplete="off" />
        </div>
        {llm.provider === 'custom' && (
          <div className="field">
            <label className="lab" htmlFor="st-llm-base">Base URL</label>
            <input id="st-llm-base" className="val wide" value={llm.baseUrl} onChange={(e) => patch({ baseUrl: e.target.value })} placeholder={DEFAULT_BASE_URL} spellCheck={false} autoComplete="off" />
          </div>
        )}
      </div>
      <div className="st-actions">
        <button className="btn" onClick={test}>Test</button>
        <span role="status" className={`st-status${status.text.startsWith('Connected') ? ' ok' : ''}`}>{status.text}</span>
      </div>
      <p className="fine">{LLM_CAPTION}</p>
    </section>
  )
}

function CrewSection() {
  const { relayUrl } = useSettings()
  const [url, setUrl] = useState(relayUrl)
  const save = () => settings.set({ relayUrl: url.trim().replace(/\/+$/, '') })
  return (
    <section className="setting">
      <h2>{SECTION.crew}</h2>
      <div className="fields keys">
        <div className="field">
          <label className="lab" htmlFor="st-relay">Relay URL</label>
          <input id="st-relay" className="val wide" value={url} onChange={(e) => setUrl(e.target.value)} onBlur={save} placeholder={DEFAULT_RELAY} spellCheck={false} autoComplete="off" />
        </div>
      </div>
      <p className="fine">{RELAY_CAPTION}</p>
    </section>
  )
}

function AccountSection({ onSignIn, fetchFn }: { onSignIn(): void; fetchFn: typeof fetch }) {
  const acct = useAccount()
  const prof = useProfile()
  const { accountUrl } = useSettings()
  const [url, setUrl] = useState(accountUrl)
  const [status, setStatus] = useState('')
  const save = () => settings.set({ accountUrl: url.trim().replace(/\/+$/, '') || DEFAULT_ACCOUNT })
  const state = vaultStatus(acct, prof)
  const out = async () => { setStatus(''); await logOut(api(fetchFn)) }
  const del = async () => {
    if (!window.confirm(ACCOUNT.delConfirm)) return
    setStatus('')
    try { await deleteAccount(api(fetchFn)) } catch (e) { setStatus(messageOf(e)) }
  }
  return (
    <section className="setting st-account">
      <h2>{SECTION.account}</h2>
      {acct.session ? (
        <>
          <Field label="Signed in as">{acct.session.email}</Field>
          <VaultLine state={state} fetchFn={fetchFn} />
          <div className="st-actions">
            <button className="btn" onClick={out}>{ACCOUNT.logOut}</button>
            <button className="btn danger" onClick={del}>{ACCOUNT.del}</button>
            {status && <span role="status" className="st-status">{status}</span>}
          </div>
        </>
      ) : (
        <>
          <p className="fine" style={{ margin: 0 }}>{ACCOUNT.signedOut}</p>
          <div className="st-actions"><button className="btn" onClick={onSignIn}>{ACCOUNT.signIn}</button></div>
        </>
      )}
      <div className="fields keys">
        <div className="field">
          <label className="lab" htmlFor="st-account">{ACCOUNT.url}</label>
          <input id="st-account" className="val wide" value={url} onChange={(e) => setUrl(e.target.value)} onBlur={save} placeholder={DEFAULT_ACCOUNT} spellCheck={false} autoComplete="off" />
        </div>
      </div>
      <p className="fine">{ACCOUNT.caption}</p>
    </section>
  )
}

/**
 * "Up to date" or "out of date · Update". Update asks for the passphrase, since the key does not outlive the page, and
 * proves it against the vault already on the service before anything is re-sealed; only a missing vault takes a new one.
 */
function VaultLine({ state, fetchFn }: { state: VaultStatus; fetchFn: typeof fetch }) {
  const [asking, setAsking] = useState(false)
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const client = api(fetchFn)
      const a = useAccount.getState()
      const body = await client.getVault()
      let salt: Uint8Array, key: Uint8Array
      if (body) {
        salt = unb64(body.salt); key = await deriveKey(pass, salt)
        try { await openVault(key, body) } catch { setErr(ACCOUNT.wrong); return }
      } else {
        // Only a fresh vault takes a new passphrase; one already sealed is proved against, whatever it is.
        const problem = passphraseProblem(pass)
        if (problem) { setErr(problem === 'short' ? ACCOUNT.tooShort : ACCOUNT.tooEasy); return }
        salt = newSalt(); key = await deriveKey(pass, salt)
      }
      await a.setSalt(b64(salt)); a.setKey(key)
      if (await uploadVault({ client: () => client })) { setAsking(false); setPass('') } else setErr("The vault didn't go up. Check your connection.")
    } catch (e) { setErr(messageOf(e)) } finally { setBusy(false) }
  }
  if (state === 'none') return null
  const line = state === 'fresh' ? ACCOUNT.fresh : state === 'empty' ? ACCOUNT.empty : ACCOUNT.stale
  return (
    <div className="st-vault">
      <span role="status" className={`st-status${state === 'stale' ? '' : ' ok'}`}>{line}</span>
      {state === 'stale' && !asking && <button className="btn quiet" style={{ margin: 0 }} onClick={() => setAsking(true)}>{ACCOUNT.update}</button>}
      {asking && (
        <form onSubmit={submit}>
          <input type="password" aria-label="Recovery passphrase" placeholder="Recovery passphrase" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} disabled={busy} autoFocus />
          <button className="btn" type="submit" style={{ margin: 0 }} disabled={busy || !pass.trim()}>{ACCOUNT.update}</button>
          {busy && <span className="acct-busy">Sealing…</span>}
          {err && <span role="alert" className="dz-err">{err}</span>}
          {!err && !busy && <span className="fine" style={{ margin: 0 }}>{ACCOUNT.updateHint}</span>}
        </form>
      )}
    </div>
  )
}

function UnitsSection() {
  const prof = useProfile()
  const units = prof?.units ?? 'km'
  const pick = (u: 'km' | 'mi') => { if (prof) profile.set({ ...prof, units: u }) }
  return (
    <section className="setting">
      <h2>{SECTION.units}</h2>
      <div className="st-units" role="radiogroup" aria-label="Units">
        {(['km', 'mi'] as const).map((u) => (
          <label key={u} className="btn quiet" aria-pressed={units === u}>
            <input type="radio" name="units" value={u} checked={units === u} onChange={() => pick(u)} />{u}
          </label>
        ))}
      </div>
    </section>
  )
}

function DataSection() {
  const rec = useRecord()
  const close = useStore((s) => s.closeSettings)
  const clear = () => { if (window.confirm(CLEAR_CONFIRM)) { close(); rec.reset() } }
  return (
    <section className="setting">
      <h2>{SECTION.data}</h2>
      <Field label="Kept">In this browser only</Field>
      <div className="st-actions">
        <button className="btn" onClick={clear}>{CLEAR_LABEL}</button>
        <ImportButton stage={rec.stage} importFile={rec.importFile} label={IMPORT_LABEL} />
      </div>
      {rec.importError && <div className="ob-error" role="alert">{rec.importError.message}</div>}
    </section>
  )
}
