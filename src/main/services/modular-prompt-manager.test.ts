import { describe, expect, it, vi } from 'vitest'
import { ModularPromptManager } from './modular-prompt-manager'
import { SkillPackService } from './skill-pack-service'

describe('ModularPromptManager', () => {
  it('appends compact skill index to base prompt when skills are available', async () => {
    const promptModuleService = {
      initialize: vi.fn(async () => undefined)
    }
    const agentRegistryService = {
      initialize: vi.fn(async () => undefined),
      getAgentById: vi.fn(async () => null)
    }
    const skillPackService = {
      buildPromptSections: vi.fn(() => ({
        compactIndexSection: 'SKILLS INDEX (compact):\n- `$geo` (workspace) - geospatial',
        selectedInstructionSection: '',
        selectedSkillIds: ['geo']
      }))
    } as unknown as SkillPackService

    const manager = new ModularPromptManager(
      promptModuleService as never,
      agentRegistryService as never,
      skillPackService
    )

    const prompt = await manager.getSystemPrompt('chat-1', 'BASE PROMPT', undefined, {
      recentUserMessages: ['hello']
    })

    expect(prompt).toContain('BASE PROMPT')
    expect(prompt).toContain('SKILLS INDEX (compact)')
    expect(skillPackService.buildPromptSections).toHaveBeenCalledTimes(1)
  })

  it('includes selected skill instruction section when mention context is present', async () => {
    const promptModuleService = {
      initialize: vi.fn(async () => undefined),
      assemblePrompt: vi.fn(async () => ({
        assembledPrompt: 'AGENT PROMPT',
        includedModules: [],
        tokenCount: 3
      }))
    }
    const agentRegistryService = {
      initialize: vi.fn(async () => undefined),
      getAgentById: vi.fn(async () => ({
        id: 'agent-1',
        name: 'Agent',
        type: 'specialized',
        modelConfig: { provider: 'openai', model: 'gpt-4.1' },
        toolAccess: [],
        promptConfig: {
          coreModules: [],
          agentModules: [],
          taskModules: [],
          ruleModules: []
        }
      }))
    }
    const skillPackService = {
      buildPromptSections: vi.fn(() => ({
        compactIndexSection: 'SKILLS INDEX (compact):\n- `$geo` (workspace) - geospatial',
        selectedInstructionSection: 'SELECTED SKILL INSTRUCTIONS (loaded on demand):\n### `$geo`',
        selectedSkillIds: ['geo']
      }))
    } as unknown as SkillPackService

    const manager = new ModularPromptManager(
      promptModuleService as never,
      agentRegistryService as never,
      skillPackService
    )

    const prompt = await manager.getSystemPrompt('chat-1', 'BASE PROMPT', 'agent-1', {
      recentUserMessages: ['use $geo']
    })

    expect(prompt).toContain('AGENT PROMPT')
    expect(prompt).toContain('SELECTED SKILL INSTRUCTIONS')
  })
})
