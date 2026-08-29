/** Claude Code Agent SDK boundary used by the DSH main-model adapter. */

import { access } from 'node:fs/promises'
import { delimiter, isAbsolute, join } from 'node:path'
import { query } from '@anthropic-ai/claude-agent-sdk'
import type { EffortLevel, ModelInfo, PermissionMode, SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { LlmError } from '@deepseek-ai/dsh-llm'

export interface ClaudeCodeModel {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly resolvedModel?: string
  readonly reasoningEfforts: readonly EffortLevel[]
}

export interface ClaudeCodeStreamRequest {
  readonly model: string
  readonly effort?: EffortLevel
  readonly system: string
  readonly prompt: string
  readonly signal?: AbortSignal
}

export type ClaudeCodeEvent =
  | { readonly kind: 'text-delta'; readonly text: string }
  | { readonly kind: 'reasoning-delta'; readonly text: string }
  | {
      readonly kind: 'usage'
      readonly inputTokens: number
      readonly outputTokens: number
      readonly cacheReadTokens: number
      readonly cacheWriteTokens: number
    }
  | { readonly kind: 'completed' }

export interface ClaudeCodeRuntimePort {
  listModels(signal?: AbortSignal): Promise<readonly ClaudeCodeModel[]>
  stream(request: ClaudeCodeStreamRequest): AsyncIterable<ClaudeCodeEvent>
}

export interface ClaudeCodeRuntimeOptions {
  readonly executable: string
  readonly cwd: string
  readonly permissionMode: PermissionMode
  readonly timeoutMs: number
  readonly modelCacheMs: number
  readonly env: Readonly<Record<string, string>>
}

const FALLBACK_MODELS: readonly ClaudeCodeModel[] = Object.freeze([
  { id: 'default', name: 'Default (recommended)', description: 'Claude Code account default.', reasoningEfforts: [] },
  { id: 'opus', name: 'Opus', description: 'Claude Code Opus alias.', reasoningEfforts: [] },
  { id: 'sonnet', name: 'Sonnet', description: 'Claude Code Sonnet alias.', reasoningEfforts: [] },
  { id: 'haiku', name: 'Haiku', description: 'Claude Code Haiku alias.', reasoningEfforts: [] },
])

function model(model: ModelInfo): ClaudeCodeModel {
  return {
    id: model.value,
    name: model.displayName,
    description: model.description,
    ...(model.resolvedModel === undefined ? {} : { resolvedModel: model.resolvedModel }),
    reasoningEfforts: model.supportedEffortLevels ?? [],
  }
}

function failure(error: unknown): LlmError {
  if (error instanceof LlmError) return error
  const message = error instanceof Error ? error.message : String(error)
  if (/auth|login|oauth/i.test(message)) return new LlmError(message, 'AUTH')
  if (/rate|limit|overloaded/i.test(message)) return new LlmError(message, 'RATE_LIMIT')
  if (/abort/i.test(message)) return new LlmError(message, 'ABORTED')
  return new LlmError(`Claude Code failed: ${message}`, 'SERVER')
}

async function executablePath(value: string): Promise<string> {
  if (isAbsolute(value) || value.includes('/')) {
    await access(value)
    return value
  }
  for (const root of (process.env.PATH ?? '').split(delimiter)) {
    if (root.length === 0) continue
    const candidate = join(root, value)
    try {
      await access(candidate)
      return candidate
    } catch {
      // Continue through PATH. The final error names the requested executable.
    }
  }
  throw new LlmError(`Claude Code executable ${JSON.stringify(value)} was not found on PATH`, 'AUTH')
}

function delta(message: SDKMessage): ClaudeCodeEvent | undefined {
  if (message.type !== 'stream_event' || message.parent_tool_use_id !== null) return undefined
  if (message.event.type !== 'content_block_delta') return undefined
  const value = message.event.delta
  if (value.type === 'text_delta') return { kind: 'text-delta', text: value.text }
  if (value.type === 'thinking_delta') return { kind: 'reasoning-delta', text: value.thinking }
  return undefined
}

/** Agent SDK runtime that deliberately reuses native Claude settings and login state. */
export class ClaudeCodeRuntime implements ClaudeCodeRuntimePort {
  private models: { readonly expires: number; readonly value: Promise<readonly ClaudeCodeModel[]> } | undefined

  constructor(private readonly options: ClaudeCodeRuntimeOptions) {}

  listModels(signal?: AbortSignal): Promise<readonly ClaudeCodeModel[]> {
    const now = Date.now()
    if (this.models !== undefined && this.models.expires > now) return this.models.value
    const value = this.probeModels(signal).catch((error: unknown) => {
      if (signal?.aborted) throw failure(error)
      return FALLBACK_MODELS
    })
    this.models = { expires: now + this.options.modelCacheMs, value }
    return value
  }

  private async probeModels(signal?: AbortSignal): Promise<readonly ClaudeCodeModel[]> {
    const controller = new AbortController()
    const abort = () => { controller.abort(signal?.reason) }
    signal?.addEventListener('abort', abort, { once: true })
    async function* idle(): AsyncIterable<never> {
      await new Promise<void>(resolve => controller.signal.addEventListener('abort', () => resolve(), { once: true }))
    }
    const executable = await executablePath(this.options.executable)
    const instance = query({
      prompt: idle(),
      options: {
        abortController: controller,
        pathToClaudeCodeExecutable: executable,
        cwd: this.options.cwd,
        permissionMode: this.options.permissionMode,
        settingSources: ['user', 'project', 'local'],
        persistSession: false,
        tools: [],
        ...(Object.keys(this.options.env).length === 0
          ? {}
          : { env: { ...process.env, ...this.options.env } }),
      },
    })
    try {
      const discovered = await instance.supportedModels()
      if (discovered.length === 0) throw new Error('Claude Code returned an empty model catalog')
      return discovered.map(model)
    } finally {
      controller.abort()
      instance.close()
      signal?.removeEventListener('abort', abort)
    }
  }

  async * stream(request: ClaudeCodeStreamRequest): AsyncIterable<ClaudeCodeEvent> {
    const controller = new AbortController()
    const abort = () => { controller.abort(request.signal?.reason) }
    request.signal?.addEventListener('abort', abort, { once: true })
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort(new Error('Claude Code request timed out'))
    }, this.options.timeoutMs)
    let instance: ReturnType<typeof query> | undefined
    try {
      const executable = await executablePath(this.options.executable)
      instance = query({
        prompt: request.prompt,
        options: {
          abortController: controller,
          pathToClaudeCodeExecutable: executable,
          cwd: this.options.cwd,
          model: request.model,
          permissionMode: this.options.permissionMode,
          settingSources: ['user', 'project', 'local'],
          persistSession: false,
          includePartialMessages: true,
          systemPrompt: { type: 'preset', preset: 'claude_code', append: request.system },
          tools: { type: 'preset', preset: 'claude_code' },
          ...(request.effort === undefined
            ? {}
            : { thinking: { type: 'adaptive' }, effort: request.effort }),
          ...(Object.keys(this.options.env).length === 0
            ? {}
            : { env: { ...process.env, ...this.options.env } }),
        },
      })
      let completed = false
      let streamedText = false
      for await (const message of instance) {
        const streamed = delta(message)
        if (streamed !== undefined) {
          if (streamed.kind === 'text-delta') streamedText = true
          yield streamed
        }
        if (message.type !== 'result') continue
        if (message.subtype !== 'success' || message.is_error) {
          const detail = 'errors' in message ? message.errors.join('; ') : message.result
          throw new LlmError(detail || 'Claude Code request failed', 'SERVER')
        }
        if (!streamedText && message.result.length > 0) {
          yield { kind: 'text-delta', text: message.result }
        }
        yield {
          kind: 'usage',
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
        }
        completed = true
      }
      if (!completed) throw new LlmError('Claude Code stream ended without a result', 'TRANSPORT')
      yield { kind: 'completed' }
    } catch (error) {
      if (timedOut) throw new LlmError('Claude Code request timed out', 'TIMEOUT')
      throw failure(error)
    } finally {
      clearTimeout(timeout)
      request.signal?.removeEventListener('abort', abort)
      instance?.close()
    }
  }
}
