import { describe, expect, it, vi } from 'vitest'
import { AgentToolManager } from './agent-tool-manager'
import type { AgentDefinition, AgentRegistryEntry } from '../../shared/types/agent-types'

function createRegistryEntry(id: string, name: string): AgentRegistryEntry {
  return {
    id,
    name,
    description: `${name} description`,
    type: 'user-defined',
    capabilities: [],
    toolAccess: [],
    provider: 'openai',
    model: 'gpt-4.1',
    createdAt: '2026-03-23T00:00:00.000Z',
    updatedAt: '2026-03-23T00:00:00.000Z'
  }
}

function createAgentDefinition(
  id: string,
  name: string,
  role: AgentDefinition['role'],
  toolAccess: string[] = []
): AgentDefinition {
  return {
    id,
    name,
    description: `${name} description`,
    type: 'user-defined',
    role,
    capabilities: [],
    promptConfig: {
      coreModules: [],
      agentModules: []
    },
    modelConfig: {
      provider: 'openai',
      model: 'gpt-4.1'
    },
    toolAccess,
    createdAt: '2026-03-23T00:00:00.000Z',
    updatedAt: '2026-03-23T00:00:00.000Z'
  }
}

describe('AgentToolManager', () => {
  it('hides call_agent when no specialist agents are registered', async () => {
    const llmToolService = {
      getToolDefinitionsForLLM: vi.fn(async () => ({
        call_agent: { name: 'call_agent' },
        query_knowledge_base: { name: 'query_knowledge_base' }
      }))
    }
    const orchestrator = createAgentDefinition('orch-1', 'Orchestrator', 'orchestrator')
    const agentRegistryService = {
      getAllAgents: vi.fn(async () => [createRegistryEntry('orch-1', 'Orchestrator')]),
      getAgentById: vi.fn(async (id: string) => (id === 'orch-1' ? orchestrator : null))
    }

    const manager = new AgentToolManager(llmToolService as never, agentRegistryService as never)
    const tools = await manager.getToolsForAgent()

    expect(Object.keys(tools)).toEqual(['query_knowledge_base'])
  })

  it('keeps call_agent available when at least one specialist exists', async () => {
    const llmToolService = {
      getToolDefinitionsForLLM: vi.fn(async () => ({
        call_agent: { name: 'call_agent' },
        query_knowledge_base: { name: 'query_knowledge_base' }
      }))
    }
    const orchestrator = createAgentDefinition('orch-1', 'Orchestrator', 'orchestrator')
    const specialist = createAgentDefinition('spec-1', 'File Inspector', 'specialist', [
      'query_knowledge_base'
    ])
    const agentRegistryService = {
      getAllAgents: vi.fn(async () => [
        createRegistryEntry('orch-1', 'Orchestrator'),
        createRegistryEntry('spec-1', 'File Inspector')
      ]),
      getAgentById: vi.fn(async (id: string) => {
        if (id === 'orch-1') return orchestrator
        if (id === 'spec-1') return specialist
        return null
      })
    }

    const manager = new AgentToolManager(llmToolService as never, agentRegistryService as never)
    const tools = await manager.getToolsForAgent()

    expect(Object.keys(tools)).toContain('call_agent')
  })
})
