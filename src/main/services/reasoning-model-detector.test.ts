import { describe, expect, it } from 'vitest'
import {
  detectReasoningModel,
  isToolSchemaError,
  shouldDisableToolsForReasoningModel
} from './reasoning-model-detector'

describe('detectReasoningModel', () => {
  it('detects provider-specific reasoning models', () => {
    expect(detectReasoningModel('o3', 'openai')).toBe(true)
    expect(detectReasoningModel('gemini-3-pro-preview', 'google')).toBe(true)
    expect(detectReasoningModel('claude-3-7-sonnet-latest', 'anthropic')).toBe(true)
    expect(detectReasoningModel('prod-eastus', 'azure', 'reasoning')).toBe(true)
  })

  it('returns false for undefined or unrelated models', () => {
    expect(detectReasoningModel(undefined)).toBe(false)
    expect(detectReasoningModel('gpt-4o-mini', 'openai')).toBe(false)
  })
})

describe('shouldDisableToolsForReasoningModel', () => {
  it('returns structured reasoning metadata without disabling tools', () => {
    expect(shouldDisableToolsForReasoningModel('o3', 'openai')).toEqual({
      isReasoningModel: true,
      shouldDisableTools: false,
      modelId: 'o3',
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
