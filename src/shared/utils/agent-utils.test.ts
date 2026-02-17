import { describe, expect, it } from 'vitest'
import { isOrchestratorAgent } from './agent-utils'

describe('isOrchestratorAgent', () => {
  it('returns false for empty input', () => {
    expect(isOrchestratorAgent(null)).toBe(false)
    expect(isOrchestratorAgent(undefined)).toBe(false)
  })

  it('uses explicit role when present', () => {
    expect(isOrchestratorAgent({ role: 'orchestrator' })).toBe(true)
    expect(
      isOrchestratorAgent({
        role: 'worker',
        capabilities: [{ name: 'orchestration helper' }]
      })
    ).toBe(false)
  })

  it('falls back to capabilities when role is not present', () => {
    expect(
      isOrchestratorAgent({
        capabilities: [{ name: 'Task Orchestration' }]
      })
    ).toBe(true)

    expect(
      isOrchestratorAgent({
        capabilities: [{ description: 'Handles orchestration pipelines' }]
      })
    ).toBe(true)

    expect(
      isOrchestratorAgent({
        capabilities: [{ name: 'Data loader' }]
      })
    ).toBe(false)
  })
})
