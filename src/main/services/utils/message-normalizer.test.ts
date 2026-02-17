import { describe, expect, it } from 'vitest'
import { normalizeRendererMessages, sanitizeModelMessages } from './message-normalizer'

describe('normalizeRendererMessages', () => {
  it('returns an empty array for non-array input', () => {
    expect(normalizeRendererMessages(null as never)).toEqual([])
  })

  it('normalizes tool invocation payloads', () => {
    const rendererMessages = [
      {
        role: 'assistant',
        parts: [
          { type: 'text', text: 'working...' },
          {
            type: 'tool-invocation',
            toolInvocation: {
              toolCallId: 'call_123',
              toolName: 'buffer polygons',
              state: 'result',
              args: { distance: 10 },
              result: { ok: true },
              providerExecuted: true,
              providerMetadata: { provider: 'openai' }
            }
          }
        ]
      }
    ]

    const normalized = normalizeRendererMessages(rendererMessages)
    const toolPart = normalized[0].parts[1]

    expect(toolPart).toEqual({
      type: 'tool-buffer_polygons',
      toolCallId: 'call_123',
      state: 'output-available',
      input: { distance: 10 },
      output: { ok: true },
      providerExecuted: true,
      callProviderMetadata: { provider: 'openai' }
    })
  })

  it('preserves message references when no normalization is needed', () => {
    const message = { role: 'assistant', parts: [{ type: 'text', text: 'ready' }] }
    const normalized = normalizeRendererMessages([message])

    expect(normalized[0]).toBe(message)
  })
})

describe('sanitizeModelMessages', () => {
  it('removes invalid tool and assistant messages', () => {
    const messages: Array<{
      role: 'assistant' | 'tool'
      content: unknown
    }> = [
      {
        role: 'assistant',
        content: []
      },
      {
        role: 'tool',
        content: [
          {
            toolCallId: 'call_1',
            toolName: 'buffer'
          }
        ]
      },
      {
        role: 'tool',
        content: [
          {
            toolCallId: 'call_2',
            toolName: 'buffer',
            output: { ok: true }
          }
        ]
      }
    ]

    const sanitized = sanitizeModelMessages(messages as never)

    expect(sanitized).toEqual([messages[2]])
  })
})
