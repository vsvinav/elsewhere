import { describe, expect, it } from 'vitest'
import { DEFAULT_MODEL, askLlm, llmRequest, modelOf, parseLlmReply, type LlmConfig } from './llm'

const cfg = (p: Partial<LlmConfig>): LlmConfig => ({ provider: 'openai', key: '', model: '', baseUrl: '', ...p })

describe('modelOf', () => {
  it('falls back to the provider default', () => {
    expect(modelOf(cfg({ provider: 'anthropic' }))).toBe('claude-3-5-haiku-latest')
    expect(modelOf(cfg({ provider: 'gemini', model: 'gemini-1.5-pro' }))).toBe('gemini-1.5-pro')
    expect(DEFAULT_MODEL).toEqual({ openai: 'gpt-4o-mini', anthropic: 'claude-3-5-haiku-latest', gemini: 'gemini-2.0-flash', custom: 'llama3.1' })
  })
})

describe('llmRequest', () => {
  it('openai: chat completions with a bearer key', () => {
    const r = llmRequest(cfg({ key: 'sk-1' }), 'hi')
    expect(r.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(r.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer sk-1' })
    expect(JSON.parse(r.body)).toEqual({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], max_tokens: 256 })
  })
  it('anthropic: messages endpoint with its own headers', () => {
    const r = llmRequest(cfg({ provider: 'anthropic', key: 'ak' }), 'hi')
    expect(r.url).toBe('https://api.anthropic.com/v1/messages')
    expect(r.headers).toEqual({ 'Content-Type': 'application/json', 'x-api-key': 'ak', 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' })
    expect(JSON.parse(r.body)).toEqual({ model: 'claude-3-5-haiku-latest', max_tokens: 256, messages: [{ role: 'user', content: 'hi' }] })
  })
  it('gemini: key in the query string, model in the path', () => {
    const r = llmRequest(cfg({ provider: 'gemini', key: 'gk' }), 'hi')
    expect(r.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=gk')
    expect(r.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(r.body)).toEqual({ contents: [{ parts: [{ text: 'hi' }] }] })
  })
  it('custom: base URL without a double slash and no Authorization when the key is empty', () => {
    const r = llmRequest(cfg({ provider: 'custom', baseUrl: 'http://localhost:11434/v1/' }), 'hi')
    expect(r.url).toBe('http://localhost:11434/v1/chat/completions')
    expect(r.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(r.body).model).toBe('llama3.1')
    expect(llmRequest(cfg({ provider: 'custom' }), 'hi').url).toBe('http://localhost:11434/v1/chat/completions')
  })
})

describe('parseLlmReply', () => {
  it('reads the first reply per provider', () => {
    expect(parseLlmReply('openai', { choices: [{ message: { content: 'OK' } }] })).toBe('OK')
    expect(parseLlmReply('custom', { choices: [{ message: { content: 'OK' } }] })).toBe('OK')
    expect(parseLlmReply('anthropic', { content: [{ type: 'text', text: 'OK' }] })).toBe('OK')
    expect(parseLlmReply('gemini', { candidates: [{ content: { parts: [{ text: 'OK' }] } }] })).toBe('OK')
  })
  it('throws on an empty reply', () => {
    expect(() => parseLlmReply('openai', { choices: [] })).toThrow('Empty reply')
    expect(() => parseLlmReply('anthropic', {})).toThrow('Empty reply')
    expect(() => parseLlmReply('gemini', null)).toThrow('Empty reply')
  })
})

describe('askLlm', () => {
  it('rejects with the HTTP status when the provider refuses', async () => {
    const fetchFn = (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch
    await expect(askLlm(cfg({ key: 'bad' }), 'hi', fetchFn)).rejects.toThrow('HTTP 401')
  })
  it('returns the reply text', async () => {
    const fetchFn = (async () => Response.json({ choices: [{ message: { content: 'OK' } }] })) as unknown as typeof fetch
    await expect(askLlm(cfg({ key: 'k' }), 'hi', fetchFn)).resolves.toBe('OK')
  })
})
