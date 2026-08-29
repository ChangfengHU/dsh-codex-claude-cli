/** DSH main-model adapter backed by the locally authenticated Claude Code CLI. */

import {
  contentHasImage,
  LlmAdapter,
  LlmError,
  ReasoningEffortId,
} from '@deepseek-ai/dsh-llm'
import type {
  ContentBlock,
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  Message,
  ResolvedRetryPolicy,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type { EffortLevel } from '@anthropic-ai/claude-agent-sdk'
import type { ClaudeCodeModel, ClaudeCodeRuntimePort } from './claude-runtime.ts'

export interface ClaudeCodeAdapterOptions {
  readonly provider: string
  readonly displayName: string
  readonly maxRetries: number
  readonly runtime: ClaudeCodeRuntimePort
}

const RETRYABLE_CODES = Object.freeze(['RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT'])

function info(provider: string, model: ClaudeCodeModel): LlmModelInfo {
  return {
    provider,
    id: model.id,
    name: model.name,
    description: model.resolvedModel === undefined
      ? model.description
      : `${model.description} (${model.resolvedModel})`,
    inputModalities: ['text'],
  }
}

function blockText(block: ContentBlock): string {
  if (block.type === 'text') return block.text
  if (block.type === 'reasoning') return `[assistant reasoning]\n${block.text}`
  if (block.type === 'tool-call') return `[tool call ${block.name}]\n${block.arguments}`
  if (block.type === 'image') return '[image omitted: Claude Code DSH bridge currently accepts text history only]'
  return `[${block.type}]\n${JSON.stringify(block)}`
}

function role(message: Message): string {
  if (message.source.kind === 'model') return 'assistant'
  if (message.source.kind === 'tool') return 'tool'
  if (message.source.kind === 'user') return 'user'
  return `context:${message.source.kind}`
}

/** Stable, explicit transcript used for stateless reconstruction on every turn. */
export function claudePrompt(messages: readonly Message[]): string {
  return [
    'The following is the authoritative DeepSeek Harness conversation transcript.',
    'Continue from it and answer the final user request. Do not repeat role labels.',
    ...messages.map(message => `\n<${role(message)}>\n${message.content.map(blockText).join('\n')}`),
  ].join('\n')
}

/** Claude Code appears beside Codex in the normal DSH provider/model selector. */
export class ClaudeCodeAdapter extends LlmAdapter {
  constructor(private readonly options: ClaudeCodeAdapterOptions) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: this.options.displayName }
  }

  override providerRetryPolicy(_provider: string): ResolvedRetryPolicy {
    return {
      mode: 'normal',
      maxRetries: this.options.maxRetries,
      retryableCodes: RETRYABLE_CODES,
      initialDelayMs: 1_000,
      maxDelayMs: 10_000,
      jitterRatio: 0.1,
    }
  }

  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return (await this.options.runtime.listModels()).map(model => info(provider, model))
  }

  override async resolveModel(
    provider: string,
    modelId: string,
    signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    const model = (await this.options.runtime.listModels(signal)).find(candidate => candidate.id === modelId)
      ?? { id: modelId, name: modelId, description: 'Custom Claude Code model.', reasoningEfforts: [] }
    return {
      ...info(provider, model),
      ...(model.reasoningEfforts.length === 0
        ? {}
        : {
            reasoning: {
              efforts: model.reasoningEfforts.map(effort => ({
                id: ReasoningEffortId(effort),
                name: effort.charAt(0).toUpperCase() + effort.slice(1),
              })),
              defaultEffort: ReasoningEffortId(model.reasoningEfforts.includes('high') ? 'high' : model.reasoningEfforts[0]!),
            },
          }),
    }
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (options.temperature !== undefined || options.maxTokens !== undefined || options.stop !== undefined) {
      throw new LlmError(
        'Claude Code provider does not support temperature, maxTokens, or stop overrides',
        'UNSUPPORTED_OPTION',
      )
    }
    if (options.messages.some(message => contentHasImage(message.content))) {
      throw new LlmError('Claude Code DSH bridge currently accepts text history only', 'UNSUPPORTED_CONTENT')
    }
    const effort = options.reasoningEffort === undefined ? undefined : String(options.reasoningEffort) as EffortLevel
    let text = ''
    let reasoning = ''
    let textIndex: number | undefined
    let reasoningIndex: number | undefined
    let nextIndex = 0
    let usage: Extract<StreamChunk, { type: 'usage' }>['usage'] | undefined
    for await (const event of this.options.runtime.stream({
      model: options.model,
      ...(effort === undefined ? {} : { effort }),
      system: options.system ?? '',
      prompt: claudePrompt(options.messages),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    })) {
      if (event.kind === 'text-delta') {
        if (textIndex === undefined) {
          textIndex = nextIndex++
          yield { type: 'block-start', index: textIndex, blockType: 'text' }
        }
        text += event.text
        yield { type: 'text-delta', index: textIndex, text: event.text }
      } else if (event.kind === 'reasoning-delta') {
        if (reasoningIndex === undefined) {
          reasoningIndex = nextIndex++
          yield { type: 'block-start', index: reasoningIndex, blockType: 'reasoning' }
        }
        reasoning += event.text
        yield { type: 'reasoning-delta', index: reasoningIndex, text: event.text }
      } else if (event.kind === 'usage') {
        usage = {
          inputTokens: Math.max(0, event.inputTokens - event.cacheReadTokens - event.cacheWriteTokens),
          outputTokens: event.outputTokens,
          cacheReadTokens: event.cacheReadTokens,
          cacheWriteTokens: event.cacheWriteTokens,
        }
      }
    }
    if (reasoningIndex !== undefined) {
      yield { type: 'block-end', index: reasoningIndex, block: { type: 'reasoning', text: reasoning } }
    }
    if (textIndex !== undefined) {
      yield { type: 'block-end', index: textIndex, block: { type: 'text', text } }
    }
    if (usage !== undefined) yield { type: 'usage', usage }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
