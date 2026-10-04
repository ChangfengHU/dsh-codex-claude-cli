/** Follow the native Codex catalog without changing its config or authentication. */
import { readFile, stat, mkdtemp, writeFile, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { CodexModel } from './adapter.ts'
import { SAFE_MODEL_ID, SAFE_REASONING_EFFORT } from './identifiers.ts'

export function catalogModels(data: { models?: unknown }): CodexModel[] {
  if (!Array.isArray(data.models)) throw new Error('Codex catalog has no models')
  const seen = new Set<string>()
  return [...data.models].sort((a, b) => (a.priority ?? 1000) - (b.priority ?? 1000))
    .filter(m => m.visibility === 'list' && typeof m.slug === 'string' && SAFE_MODEL_ID.test(m.slug))
    .flatMap((m): CodexModel[] => {
      if (seen.has(m.slug)) return []
      seen.add(m.slug)
      const efforts: string[] = [...new Set<string>((m.supported_reasoning_levels ?? [])
        .map((e: { effort?: unknown }) => e.effort)
        .filter((e: unknown): e is string => typeof e === 'string' && SAFE_REASONING_EFFORT.test(e)))]
      return [{
        id: m.slug, name: typeof m.display_name === 'string' ? m.display_name : m.slug,
        ...(typeof m.description === 'string' ? { description: m.description } : {}),
        ...(Number.isSafeInteger(m.context_window) && m.context_window > 0 ? { contextWindow: m.context_window } : {}),
        inputModalities: Array.isArray(m.input_modalities) && m.input_modalities.includes('image') ? ['text', 'image'] : ['text'],
        reasoningEfforts: efforts,
        ...(efforts.includes(m.default_reasoning_level) ? { defaultReasoningEffort: m.default_reasoning_level } : {}),
      }]
    })
}

export class CodexModelCatalog {
  private current: { stamp: string; models: readonly CodexModel[]; path: string } | undefined
  private pending: Promise<{ models: readonly CodexModel[]; path?: string }> | undefined
  private directory?: string
  constructor(private readonly source: string, private readonly fallback: readonly CodexModel[]) {}

  snapshot(): Promise<{ models: readonly CodexModel[]; path?: string }> {
    if (this.pending) return this.pending
    const work = this.load()
    this.pending = work
    void work.finally(() => { if (this.pending === work) this.pending = undefined }).catch(() => {})
    return work
  }
  private async load(): Promise<{ models: readonly CodexModel[]; path?: string }> {
    try {
      const info = await stat(this.source)
      if (info.size > 4 * 1024 * 1024) throw new Error('Codex catalog is too large')
      const stamp = `${info.mtimeMs}/${info.size}/${info.ino}`
      if (this.current?.stamp === stamp) return this.current
      const data = JSON.parse(await readFile(this.source, 'utf8'))
      const models = catalogModels(data)
      if (!models.length) throw new Error('Codex catalog has no visible models')
      // 0.147 requires this field, while newer native catalogs omit it.
      // Keep explicit capabilities; conservatively disable unknown parallelism.
      for (const m of data.models) m.supports_parallel_tool_calls ??= false
      this.directory ??= await mkdtemp(join(tmpdir(), 'dsh-codex-catalog-'))
      const path = join(this.directory, 'catalog.json')
      const staging = join(this.directory, randomUUID() + '.json')
      await writeFile(staging, JSON.stringify(data), { mode: 0o600 })
      await rename(staging, path)
      this.current = { stamp, models, path }
      return this.current
    } catch {
      this.current = undefined
      return { models: this.fallback }
    }
  }
  async dispose(): Promise<void> {
    await this.pending
    if (this.directory) await rm(this.directory, { recursive: true, force: true })
  }
}
