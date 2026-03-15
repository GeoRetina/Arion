import { describe, expect, it } from 'vitest'
import { applyReasoningProviderOptions } from './reasoning-provider-options'

describe('applyReasoningProviderOptions', () => {
  it('applies default google thinking config for reasoning models while preserving existing options', () => {
    const options = {
      providerOptions: {
        google: {
          temperature: 0.2,
          thinkingConfig: {
            thinkingBudget: 10
          }
        },
        otherProvider: {
          enabled: true
        }
      }
    }

    const result = applyReasoningProviderOptions(
      {
        providerId: 'google',
        modelId: 'gemini-2.5-pro'
      },
      options
    )

    expect(result).toBe(options)
    expect(result.providerOptions.google).toEqual({
      temperature: 0.2,
      thinkingConfig: {
        thinkingBudget: 10,
        includeThoughts: true
      }
    })
    expect(result.providerOptions.otherProvider).toEqual({ enabled: true })
  })

  it('maps Gemini 2.5 presets to thinking budgets', () => {
    const options = { providerOptions: { google: { labels: { env: 'test' } } } }

    const result = applyReasoningProviderOptions(
      {
        providerId: 'google',
        modelId: 'gemini-2.5-pro',
        reasoningBudgetPreset: 'high'
      },
      options
    )

    expect(result.providerOptions.google).toEqual({
      labels: { env: 'test' },
      thinkingConfig: {
        includeThoughts: true,
        thinkingBudget: 24576
      }
    })
  })

  it('applies openai reasoning settings with an override and keeps existing provider options', () => {
    const options = {
      providerOptions: {
        openai: {
          customSetting: 'x'
        }
      }
    }

    const result = applyReasoningProviderOptions(
      {
        providerId: 'openai',
        modelId: 'o3',
        reasoningEffort: 'high'
      },
      options
    )

    expect(result.providerOptions.openai).toEqual({
      customSetting: 'x',
      reasoningEffort: 'high',
      reasoningSummary: 'auto'
    })
  })

  it('normalizes invalid OpenAI effort values to a supported GPT-5.x value', () => {
    const options = { providerOptions: { openai: {} } }

    const result = applyReasoningProviderOptions(
      {
        providerId: 'openai',
        modelId: 'gpt-5.4',
        reasoningEffort: 'minimal'
      },
      options
    )

    expect(result.providerOptions.openai).toEqual({
      reasoningEffort: 'none',
      reasoningSummary: 'auto'
    })
  })

  it('maps reasoning effort to thinking level for Gemini 3 models', () => {
    const options = { providerOptions: { google: { labels: { env: 'test' } } } }
    const result = applyReasoningProviderOptions(
      {
        providerId: 'google',
        modelId: 'gemini-3-pro-preview',
        reasoningEffort: 'minimal'
      },
      options
    )

    expect(result.providerOptions.google).toEqual({
      labels: { env: 'test' },
      thinkingConfig: {
        includeThoughts: true,
        thinkingLevel: 'minimal'
      }
    })
  })

  it('uses thinking budget for Vertex reasoning models even when a reasoning effort is provided', () => {
    const options = { providerOptions: { vertex: { labels: { env: 'test' } } } }
    const result = applyReasoningProviderOptions(
      {
        providerId: 'vertex',
        modelId: 'gemini-3-pro-preview',
        reasoningEffort: 'minimal'
      },
      options
    )

    expect(result.providerOptions.vertex).toEqual({
      labels: { env: 'test' },
      thinkingConfig: {
        includeThoughts: true,
        thinkingBudget: 1024
      }
    })
  })

  it('respects Azure manual overrides for custom deployment names', () => {
    const options = { providerOptions: { azure: { region: 'canadaeast' } } }
    const result = applyReasoningProviderOptions(
      {
        providerId: 'azure',
        modelId: 'prod-eastus',
        reasoningCapabilityOverride: 'reasoning',
        reasoningEffort: 'high'
      },
      options
    )

    expect(result.providerOptions.azure).toEqual({
      region: 'canadaeast',
      reasoningEffort: 'high',
      reasoningSummary: 'auto'
    })
  })

  it('leaves options unchanged for providers or models without reasoning support', () => {
    const options = { providerOptions: { existing: { a: 1 } } }
    const result = applyReasoningProviderOptions(
      {
        providerId: 'anthropic',
        modelId: 'claude-3-5-haiku-latest'
      },
      options
    )

    expect(result).toBe(options)
    expect(result).toEqual({ providerOptions: { existing: { a: 1 } } })
  })
})
