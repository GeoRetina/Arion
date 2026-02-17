import { describe, expect, it } from 'vitest'
import { buildToolStreamChunk } from './stream-chunk-builder'

describe('buildToolStreamChunk', () => {
  it('maps tool-call parts to compatibility payloads', () => {
    const chunk = buildToolStreamChunk({
      type: 'tool-call',
      id: 'call_1',
      name: 'buffer',
      arguments: { distance: 5 }
    })

    expect(chunk).toEqual({
      prefix: '9',
      payload: {
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'buffer',
        args: { distance: 5 }
      }
    })
  })

  it('maps tool-error parts to error tool-result payloads', () => {
    const chunk = buildToolStreamChunk({
      type: 'tool-error',
      toolCallId: 'call_2',
      toolName: 'buffer',
      error: { message: 'bad input' }
    })

    expect(chunk).toEqual({
      prefix: 'a',
      payload: {
        type: 'tool-result',
        toolCallId: 'call_2',
        toolName: 'buffer',
        result: {
          status: 'error',
          message: 'bad input'
        },
        isError: true
      }
    })
  })

  it('returns null for unsupported part types', () => {
    expect(buildToolStreamChunk({ type: 'text', text: 'hi' })).toBeNull()
  })
})
