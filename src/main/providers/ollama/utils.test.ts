import { describe, expect, it } from 'vitest'
import {
  createToolCallId,
  extractOllamaResponseObjectsFromChunk,
  mapOllamaFinishReason,
  normalizeToolArguments,
  serializeToolArguments
} from './utils'
import { baseOllamaResponseSchema } from './types'

describe('mapOllamaFinishReason', () => {
  it('maps known reasons to unified reasons', () => {
    expect(mapOllamaFinishReason('stop')).toEqual({ unified: 'stop', raw: 'stop' })
    expect(mapOllamaFinishReason('length')).toEqual({ unified: 'length', raw: 'length' })
    expect(mapOllamaFinishReason('tool_calls')).toEqual({
      unified: 'tool-calls',
      raw: 'tool_calls'
    })
  })

  it('maps unknown reasons to other', () => {
    expect(mapOllamaFinishReason('unknown')).toEqual({ unified: 'other', raw: 'unknown' })
    expect(mapOllamaFinishReason(undefined)).toEqual({ unified: 'other', raw: undefined })
  })
})

describe('extractOllamaResponseObjectsFromChunk', () => {
  it('returns validated value when parse result already succeeded', () => {
    const value = baseOllamaResponseSchema.parse({
      done: true,
      message: {
        role: 'assistant',
        content: 'ok'
      }
    })

    const results = extractOllamaResponseObjectsFromChunk({
      success: true,
      value
    } as never)

    expect(results).toEqual([value])
  })

  it('extracts valid JSONL objects from error text', () => {
    const raw = [
      JSON.stringify({
        done: false,
        message: { role: 'assistant', content: 'partial' }
      }),
      '{invalid json',
      JSON.stringify({
        done: true,
        message: { role: 'assistant', content: 'done' }
      })
    ].join('\n')

    const results = extractOllamaResponseObjectsFromChunk({
      success: false,
      error: { text: raw }
    } as never)

    expect(results).toHaveLength(2)
    expect(results[0].message.content).toBe('partial')
    expect(results[1].done).toBe(true)
  })
})

describe('tool argument helpers', () => {
  it('normalizes tool arguments from strings and objects', () => {
    expect(normalizeToolArguments('{"distance":5}')).toEqual({ distance: 5 })
    expect(normalizeToolArguments('not-json')).toEqual({ input: 'not-json' })
    expect(normalizeToolArguments({ distance: 10 })).toEqual({ distance: 10 })
    expect(normalizeToolArguments(undefined)).toEqual({})
  })

  it('serializes tool arguments safely', () => {
    expect(serializeToolArguments({ distance: 5 })).toBe('{"distance":5}')
    expect(serializeToolArguments('raw')).toBe('raw')
  })

  it('creates tool call ids with fallback generator', () => {
    expect(createToolCallId(() => 'custom-id')).toBe('custom-id')
    expect(createToolCallId()).toBeTypeOf('string')
  })
})
