import { describe, expect, it } from 'vitest'
import { MessageId, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { ClaudeCodeAdapter, claudePrompt } from '../src/claude-adapter.ts'
import type {
  ClaudeCodeEvent,
  ClaudeCodeRuntimePort,
  ClaudeCodeStreamRequest,
} from '../src/claude-runtime.ts'

function runtime(events: readonly ClaudeCodeEvent[]): ClaudeCodeRuntimePort & {
  requests: ClaudeCodeStreamRequest[]
} {
  const requests: ClaudeCodeStreamRequest[] = []
  return {
    requests,
    listModels: async () => [{
      id: 'sonnet',
      name: 'Sonnet',
      description: 'Balanced Claude model.',
      resolvedModel: 'claude-sonnet-current',
      reasoningEfforts: ['low', 'high'],
    }],
    stream: (request) => (async function * () {
      requests.push(request)
      for (const event of events) yield event
    })(),
  }
}

function request(overrides: Partial<GenerateOptions> = {}): GenerateOptions {
  return {
    provider: 'claude-local',
    model: 'sonnet',
    system: 'Harness system',
    messages: [{
      id: MessageId('user-1'),
      role: 'user',
      source: { kind: 'user' },
      content: [{ type: 'text', text: 'hello' }],
    }],
    ...overrides,
  }
}

async function chunks(adapter: ClaudeCodeAdapter, options: GenerateOptions): Promise<StreamChunk[]> {
  const values: StreamChunk[] = []
  for await (const value of adapter.stream(options)) values.push(value)
  return values
}

describe('Claude Code main-model adapter', () => {
  it('discovers models live and exposes their supported reasoning efforts', async () => {
    const adapter = new ClaudeCodeAdapter({
      provider: 'claude-local',
      displayName: 'Claude Code (local login)',
      maxRetries: 0,
      runtime: runtime([]),
    })

    await expect(adapter.listModels('claude-local')).resolves.toEqual([expect.objectContaining({
      provider: 'claude-local',
      id: 'sonnet',
      name: 'Sonnet',
      description: expect.stringContaining('claude-sonnet-current'),
    })])
    await expect(adapter.resolveModel('claude-local', 'sonnet')).resolves.toMatchObject({
      reasoning: {
        efforts: [{ id: 'low' }, { id: 'high' }],
        defaultEffort: 'high',
      },
    })
  })

  it('keeps reasoning and answer blocks distinct and forwards usage', async () => {
    const fake = runtime([
      { kind: 'reasoning-delta', text: 'think' },
      { kind: 'text-delta', text: 'answer' },
      { kind: 'usage', inputTokens: 12, outputTokens: 4, cacheReadTokens: 3, cacheWriteTokens: 2 },
      { kind: 'completed' },
    ])
    const adapter = new ClaudeCodeAdapter({
      provider: 'claude-local', displayName: 'Claude', maxRetries: 0, runtime: fake,
    })
    const values = await chunks(adapter, request({ reasoningEffort: ReasoningEffortId('high') }))

    expect(values).toEqual([
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: 'think' },
      { type: 'block-start', index: 1, blockType: 'text' },
      { type: 'text-delta', index: 1, text: 'answer' },
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'think' } },
      { type: 'block-end', index: 1, block: { type: 'text', text: 'answer' } },
      { type: 'usage', usage: { inputTokens: 7, outputTokens: 4, cacheReadTokens: 3, cacheWriteTokens: 2 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
    expect(fake.requests[0]).toMatchObject({
      model: 'sonnet', effort: 'high', system: 'Harness system',
    })
    expect(fake.requests[0]?.prompt).toContain('<user>\nhello')
  })

  it('serializes the authoritative transcript with explicit roles', () => {
    expect(claudePrompt(request().messages)).toContain('<user>\nhello')
  })
})
