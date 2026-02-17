import { describe, expect, it } from 'vitest'
import {
  detectReasoningModel,
  isToolSchemaError,
  shouldDisableToolsForReasoningModel
} from './reasoning-model-detector'

describe('detectReasoningModel', () => {
  it('detects reasoning-like model names', () => {
    expect(detectReasoningModel('deep-think-model')).toBe(true)
    expect(detectReasoningModel('reflection-v2')).toBe(true)
    expect(detectReasoningModel('chain-of-thought-pro')).toBe(true)
  })

  it('returns false for undefined or unrelated models', () => {
    expect(detectReasoningModel(undefined)).toBe(false)
    expect(detectReasoningModel('gpt-4o-mini')).toBe(false)
  })
})

describe('shouldDisableToolsForReasoningModel', () => {
  it('returns structured reasoning metadata without disabling tools', () => {
    expect(shouldDisableToolsForReasoningModel('thinker-1', 'openai')).toEqual({
      isReasoningModel: true,
      shouldDisableTools: false,
      modelId: 'thinker-1',
      providerId: 'openai'
    })
  })
})

describe('isToolSchemaError', () => {
  it('matches known schema-compatibility error patterns', () => {
    expect(isToolSchemaError('Template: executing failed with no separator found')).toBe(true)
    expect(isToolSchemaError('Slice index out of range during tool parsing')).toBe(true)
  })

  it('returns false for unrelated errors', () => {
    expect(isToolSchemaError('network timeout')).toBe(false)
  })
})
