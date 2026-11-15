// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mem = vi.hoisted(() => {
  // Node's own experimental localStorage global shadows jsdom's and has no setItem.
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) })
  return mem
})

describe('settings', () => {
  beforeEach(() => { mem.clear(); vi.resetModules() })

  it('fills in llm defaults when the stored blob predates them', async () => {
    mem.set('elsewhere.settings', JSON.stringify({ mapsKey: 'AIza', mapId: 'm', mapProvider: 'osm' }))
    const { settings, DEFAULT_LLM } = await import('./settings')
    expect(settings.get().mapsKey).toBe('AIza')
    expect(settings.get().llm).toEqual({ provider: 'openai', key: '', model: '', baseUrl: '' })
    expect(DEFAULT_LLM).toEqual({ provider: 'openai', key: '', model: '', baseUrl: '' })
  })

  it('fills in missing llm fields inside a partial blob', async () => {
    mem.set('elsewhere.settings', JSON.stringify({ llm: { provider: 'gemini', key: 'g' } }))
    const { settings } = await import('./settings')
    expect(settings.get().llm).toEqual({ provider: 'gemini', key: 'g', model: '', baseUrl: '' })
  })

  it('persists an llm change in the same blob', async () => {
    const { settings } = await import('./settings')
    settings.set({ llm: { provider: 'anthropic', key: 'ak', model: '', baseUrl: '' } })
    const blob = JSON.parse(mem.get('elsewhere.settings')!)
    expect(blob.llm).toEqual({ provider: 'anthropic', key: 'ak', model: '', baseUrl: '' })
    expect(blob.mapProvider).toBe('auto')
  })
})
