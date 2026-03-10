import { describe, expect, it } from 'vitest'
import { DEFAULT_CODEX_CONFIG, normalizeCodexConfig } from './settings-service-config'

describe('normalizeCodexConfig', () => {
  it('defaults Codex reasoning effort to high', () => {
    expect(DEFAULT_CODEX_CONFIG.reasoningEffort).toBe('high')
    expect(normalizeCodexConfig(null).reasoningEffort).toBe('high')
  })

  it('preserves the xhigh reasoning effort option', () => {
    expect(
      normalizeCodexConfig({
        reasoningEffort: 'xhigh'
      }).reasoningEffort
    ).toBe('xhigh')
  })
})
