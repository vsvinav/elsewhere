/** Direct-from-browser calls to the visitor's own LLM provider. Nothing here touches the DOM or storage. */
export type LlmProvider = 'openai' | 'anthropic' | 'gemini' | 'custom'
export interface LlmConfig { provider: LlmProvider; key: string; model: string; baseUrl: string }

export const DEFAULT_MODEL: Record<LlmProvider, string> = { openai: 'gpt-4o-mini', anthropic: 'claude-3-5-haiku-latest', gemini: 'gemini-2.0-flash', custom: 'llama3.1' }
export const DEFAULT_BASE_URL = 'http://localhost:11434/v1'
/** What the Settings page sends to prove a provider answers. */
export const TEST_PROMPT = 'Reply with the single word OK.'
const OPENAI_BASE_URL = 'https://api.openai.com/v1'
const MAX_TOKENS = 256

export const modelOf = (c: LlmConfig): string => c.model.trim() || DEFAULT_MODEL[c.provider]

export function llmRequest(c: LlmConfig, prompt: string): { url: string; headers: Record<string, string>; body: string } {
  const model = modelOf(c)
  const key = c.key.trim()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (c.provider === 'anthropic') {
    Object.assign(headers, { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' })
    return { url: 'https://api.anthropic.com/v1/messages', headers, body: JSON.stringify({ model, max_tokens: MAX_TOKENS, messages: [{ role: 'user', content: prompt }] }) }
  }
  if (c.provider === 'gemini') {
    return { url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, headers, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }
  }
  const base = (c.baseUrl.trim() || (c.provider === 'custom' ? DEFAULT_BASE_URL : OPENAI_BASE_URL)).replace(/\/+$/, '')
  if (key) headers.Authorization = `Bearer ${key}`
  return { url: `${base}/chat/completions`, headers, body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: MAX_TOKENS }) }
}

const dig = (v: unknown, path: (string | number)[]): unknown => path.reduce<unknown>((o, k) => (o != null && typeof o === 'object' ? (o as Record<string | number, unknown>)[k] : undefined), v)

/** Text of the first reply; `Empty reply` when the shape has nothing in it. */
export function parseLlmReply(p: LlmProvider, json: unknown): string {
  const text =
    p === 'anthropic' ? dig(json, ['content', 0, 'text'])
    : p === 'gemini' ? dig(json, ['candidates', 0, 'content', 'parts', 0, 'text'])
    : dig(json, ['choices', 0, 'message', 'content'])
  if (typeof text !== 'string' || !text) throw new Error('Empty reply')
  return text
}

export async function askLlm(c: LlmConfig, prompt: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const { url, headers, body } = llmRequest(c, prompt)
  const res = await fetchFn(url, { method: 'POST', headers, body })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  // A 200 that is not JSON (a proxy's HTML page, an empty body) has no reply in it.
  const json = await res.json().catch(() => null)
  return parseLlmReply(c.provider, json)
}
