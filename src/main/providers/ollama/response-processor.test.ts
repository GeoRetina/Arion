import { describe, expect, it } from 'vitest'
import { OllamaResponseProcessor } from './response-processor'

describe('OllamaResponseProcessor', () => {
  it('maps generate response content, finish reason, and usage', () => {
    const processor = new OllamaResponseProcessor({
      provider: 'ollama',
      url: () => 'http://localhost',
      headers: () => ({}),
      generateId: () => 'generated-id'
    })

    const result = processor.processGenerateResponse({
      done: true,
      done_reason: 'tool_calls',
      prompt_eval_count: 10,
      eval_count: 4,
      message: {
        role: 'assistant',
        content: 'final answer',
        thinking: 'internal reasoning',
        tool_calls: [
          {
            function: {
              name: 'query_db',
              arguments: '{"sql":"select 1"}'
            }
          }
        ]
      }
    })

    expect(result.content).toEqual([
      { type: 'text', text: 'final answer' },
      { type: 'reasoning', text: 'internal reasoning' },
      {
        type: 'tool-call',
        toolCallId: 'generated-id',
        toolName: 'query_db',
        input: '{"sql":"select 1"}',
        args: { sql: 'select 1' }
      }
    ])
    expect(result.finishReason).toEqual({ unified: 'tool-calls', raw: 'tool_calls' })
    expect(result.usage).toEqual({
      inputTokens: {
        total: 10,
        noCache: 10,
        cacheRead: undefined,
        cacheWrite: undefined
      },
      outputTokens: {
        total: 4,
        text: 4,
        reasoning: undefined
      }
    })
    expect(result.providerMetadata).toEqual({ ollama: {} })
  })
})
