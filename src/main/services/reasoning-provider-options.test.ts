import { describe, expect, it } from 'vitest'
import { applyReasoningProviderOptions } from './reasoning-provider-options'

describe('applyReasoningProviderOptions', () => {
  it('applies google thinking config while preserving existing provider options', () => {
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

    const result = applyReasoningProviderOptions('google', options)

    expect(result).toBe(options)
    expect(result.providerOptions.google).toEqual({
      temperature: 0.2,
      thinkingConfig: {
        thinkingBudget: 1024,
        includeThoughts: true
      }
    })
    expect(result.providerOptions.otherProvider).toEqual({ enabled: true })
  })

  it('applies openai reasoning defaults and keeps existing openai options', () => {
    const options = {
      providerOptions: {
        openai: {
          customSetting: 'x'
        }
      }
    }

    const result = applyReasoningProviderOptions('openai', options)

    expect(result.providerOptions.openai).toEqual({
      customSetting: 'x',
      reasoningEffort: 'medium',
      reasoningSummary: 'auto'
    })
  })

  it('leaves options unchanged for unknown providers', () => {
    const options = { providerOptions: { existing: { a: 1 } } }
    const result = applyReasoningProviderOptions('anthropic', options)

    expect(result).toBe(options)
    expect(result).toEqual({ providerOptions: { existing: { a: 1 } } })
  })
})
