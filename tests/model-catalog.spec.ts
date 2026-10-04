import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CodexModelCatalog, catalogModels } from '../src/model-catalog.ts'
import { resolveCodexCapabilitySettings } from '../src/settings.ts'
const entry = (slug: string, priority: number, visibility = 'list') => ({
  slug, priority, visibility, display_name: slug, input_modalities: ['text', 'image'],
  supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }], default_reasoning_level: 'low',
})
describe('native Codex catalog projection', () => {
  it('preserves native order and efforts, excludes hidden/internal entries and duplicates', () => {
    const models = catalogModels({ models: [entry('gpt-6-astra', 2), entry('gpt-reserve', 0, 'hide'), entry('gpt-6.1-sol', 1), entry('gpt-6-astra', 3)] })
    expect(models.map(m => m.id)).toEqual(['gpt-6.1-sol', 'gpt-6-astra'])
    expect(models[0]).toMatchObject({ reasoningEfforts: ['low', 'high'], defaultReasoningEffort: 'low', inputModalities: ['text', 'image'] })
  })
  it('follows source changes and generates a private compatible copy without changing the native file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'codex-catalog-test-'))
    const source = join(dir, 'native.json'), catalog = new CodexModelCatalog(source, [])
    try {
      const raw = JSON.stringify({ models: [entry('gpt-6.1-sol', 1)] })
      await writeFile(source, raw)
      const first = await catalog.snapshot()
      expect(await readFile(source, 'utf8')).toBe(raw)
      const projected = JSON.parse(await readFile(first.path!, 'utf8'))
      expect(projected.models[0].supports_parallel_tool_calls).toBe(false)
      expect((await stat(first.path!)).mode & 0o777).toBe(0o600)
      await writeFile(source, JSON.stringify({ models: [{ ...entry('gpt-6-astra', 1), supports_parallel_tool_calls: true }] }))
      const next = await catalog.snapshot()
      expect(next.models[0]!.id).toBe('gpt-6-astra')
      expect(JSON.parse(await readFile(next.path!, 'utf8')).models[0].supports_parallel_tool_calls).toBe(true)
      await writeFile(source, '{broken')
      expect((await catalog.snapshot()).models).toEqual([])
    } finally { await catalog.dispose(); await rm(dir, { recursive: true, force: true }) }
  })
  it('validates the selected network proxy without accepting credentials or URL parameters', () => {
    expect(resolveCodexCapabilitySettings({ networkProxy: 'http://127.0.0.1:7897' }).networkProxy).toBe('http://127.0.0.1:7897')
    expect(resolveCodexCapabilitySettings({ networkProxy: '' }).networkProxy).toBeUndefined()
    for (const networkProxy of ['broken', 'file:///tmp/proxy', 'http://user:password@localhost:7897', 'http://localhost:7897/?token=x'])
      expect(() => resolveCodexCapabilitySettings({ networkProxy })).toThrow()
  })
})
