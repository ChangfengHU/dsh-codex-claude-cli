/** Isolate newer model metadata from the pinned 0.147 App Server schema. */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export function compatibleCatalog(raw: unknown): Record<string, unknown> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('model catalog must be an object')
  const data = raw as Record<string, unknown>
  if (!Array.isArray(data.models)) throw new Error('model catalog requires models array')
  return { ...data, models: data.models.map((entry: unknown) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('invalid model catalog entry')
    const model = entry as Record<string, unknown>
    if (model.supports_parallel_tool_calls !== undefined && typeof model.supports_parallel_tool_calls !== 'boolean') throw new Error('invalid parallel tool flag')
    // Missing support is deliberately conservative; never invent parallel support.
    return { ...model, supports_parallel_tool_calls: model.supports_parallel_tool_calls ?? false }
  }) }
}

export async function catalogOverride(source: string | undefined, workdir: string): Promise<string[]> {
  if (!source) return []
  const data = compatibleCatalog(JSON.parse(await readFile(source, 'utf8')))
  const target = join(workdir, 'model-catalog.json')
  await writeFile(target, JSON.stringify(data), { mode: 0o600 })
  // JSON quoting is also a valid TOML basic string for ordinary filesystem paths.
  return ['-c', `model_catalog_json=${JSON.stringify(target)}`]
}
