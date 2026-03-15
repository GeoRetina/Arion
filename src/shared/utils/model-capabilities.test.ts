import { describe, expect, it } from 'vitest'
import {
  getModelReasoningCapabilities,
  getThinkingBudgetForPreset,
  resolveReasoningBudgetPreset,
  resolveReasoningEffort
} from './model-capabilities'

describe('getModelReasoningCapabilities', () => {
  it('detects OpenAI reasoning models and reasoning effort support', () => {
    expect(getModelReasoningCapabilities('openai', 'o3')).toEqual({
      isReasoningModel: true,
      supportsReasoningEffort: true,
      supportsReasoningBudgetPresets: false,
      defaultReasoningEffort: 'medium',
      reasoningEffortValues: ['low', 'medium', 'high'],
      source: 'inferred'
    })

    expect(getModelReasoningCapabilities('openai', 'gpt-4o-mini')).toEqual({
      isReasoningModel: false,
      supportsReasoningEffort: false,
      supportsReasoningBudgetPresets: false,
      source: 'inferred'
    })
  })

  it('treats google gemini 3 models as reasoning models with effort support', () => {
    expect(getModelReasoningCapabilities('google', 'gemini-3-pro-preview')).toEqual({
      isReasoningModel: true,
      supportsReasoningEffort: true,
      supportsReasoningBudgetPresets: false,
      defaultReasoningEffort: 'medium',
      reasoningEffortValues: ['minimal', 'low', 'medium', 'high'],
      source: 'inferred'
    })
  })

  it('treats Gemini 2.5 models as reasoning with thinking-budget presets', () => {
    expect(getModelReasoningCapabilities('google', 'gemini-2.5-pro')).toEqual({
      isReasoningModel: true,
      supportsReasoningEffort: false,
      supportsReasoningBudgetPresets: true,
      defaultReasoningBudgetPreset: 'auto',
      reasoningBudgetPresetValues: ['auto', 'low', 'medium', 'high'],
      source: 'inferred'
    })

    expect(getModelReasoningCapabilities('google', 'gemini-2.0-flash-001')).toEqual({
      isReasoningModel: false,
      supportsReasoningEffort: false,
      supportsReasoningBudgetPresets: false,
      source: 'inferred'
    })
  })

  it('treats vertex reasoning models as thought-capable without effort control', () => {
    expect(getModelReasoningCapabilities('vertex', 'gemini-3-pro-preview')).toEqual({
      isReasoningModel: true,
      supportsReasoningEffort: false,
      supportsReasoningBudgetPresets: false,
      source: 'inferred'
    })
  })

  it('detects Anthropic thinking models without effort control', () => {
    expect(getModelReasoningCapabilities('anthropic', 'claude-3-7-sonnet-latest')).toEqual({
      isReasoningModel: true,
      supportsReasoningEffort: false,
      supportsReasoningBudgetPresets: false,
      source: 'inferred'
    })
  })

  it('allows Azure reasoning capability overrides for custom deployment names', () => {
    expect(getModelReasoningCapabilities('azure', 'prod-eastus', 'reasoning')).toEqual({
      isReasoningModel: true,
      supportsReasoningEffort: true,
      supportsReasoningBudgetPresets: false,
      defaultReasoningEffort: 'medium',
      reasoningEffortValues: ['low', 'medium', 'high'],
      source: 'manual'
    })

    expect(getModelReasoningCapabilities('azure', 'prod-eastus', 'standard')).toEqual({
      isReasoningModel: false,
      supportsReasoningEffort: false,
      supportsReasoningBudgetPresets: false,
      source: 'manual'
    })
  })

  it('uses newer GPT-5 effort values for modern GPT-5.x models', () => {
    expect(getModelReasoningCapabilities('openai', 'gpt-5.4')).toEqual({
      isReasoningModel: true,
      supportsReasoningEffort: true,
      supportsReasoningBudgetPresets: false,
      defaultReasoningEffort: 'none',
      reasoningEffortValues: ['none', 'low', 'medium', 'high', 'xhigh'],
      source: 'inferred'
    })
  })

  it('falls back to a supported effort when a stale preference is invalid for the model', () => {
    const capabilities = getModelReasoningCapabilities('openai', 'gpt-5.4')

    expect(resolveReasoningEffort(capabilities, 'minimal')).toBe('none')
    expect(resolveReasoningEffort(capabilities, 'xhigh')).toBe('xhigh')
  })

  it('resolves Gemini 2.5 presets to supported budgets', () => {
    const capabilities = getModelReasoningCapabilities('google', 'gemini-2.5-pro')

    expect(resolveReasoningBudgetPreset(capabilities, undefined)).toBe('auto')
    expect(getThinkingBudgetForPreset('google', 'gemini-2.5-pro', 'auto')).toBe(-1)
    expect(getThinkingBudgetForPreset('google', 'gemini-2.5-pro', 'medium')).toBe(8192)
    expect(getThinkingBudgetForPreset('google', 'gemini-2.5-flash-lite', 'low')).toBe(512)
  })

  it('handles undefined and unrelated models safely', () => {
    expect(getModelReasoningCapabilities(undefined, undefined)).toEqual({
      isReasoningModel: false,
      supportsReasoningEffort: false,
      supportsReasoningBudgetPresets: false,
      source: 'inferred'
    })

    expect(getModelReasoningCapabilities('ollama', 'llama3.2')).toEqual({
      isReasoningModel: false,
      supportsReasoningEffort: false,
      supportsReasoningBudgetPresets: false,
      source: 'inferred'
    })
  })
})
