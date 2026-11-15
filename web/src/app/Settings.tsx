import { useState } from 'react'
import { useRecord } from './App'
import { DEFAULT_BASE_URL, DEFAULT_MODEL, TEST_PROMPT, askLlm, modelOf, type LlmProvider } from '../ask/llm'
import { settings, useSettings, type MapProvider } from '../ingest/settings'
import { profile, useProfile } from '../profile/profile'
import { KeyCheck } from '../profile/KeyCheck'
import { useStore } from '../store/useStore'
import { UsageRow } from '../usage/Meter'
import { Field } from '../world'
import './settings.css'

export const SETTINGS_TITLE = 'SETTINGS'
export const SECTION = { maps: 'GOOGLE MAPS', ask: 'ASK ELSEWHERE', units: 'UNITS', data: 'DATA' } as const
export const PROVIDER_LABEL: Record<LlmProvider, string> = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini', custom: 'Ollama / custom' }
export const LLM_CAPTION = 'Your key is stored in this browser only and is sent straight to the provider you choose.'
export const NO_KEY_STATUS = 'Add a key first'
export const CLEAR_LABEL = "Clear this browser's record"
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
      <button className="btn" onClick={clear}>{CLEAR_LABEL}</button>
    </section>
  )
}
