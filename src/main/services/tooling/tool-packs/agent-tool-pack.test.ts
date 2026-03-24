import { describe, expect, it, vi } from 'vitest'

const callAgentMock = vi.fn(async (...params: unknown[]) => ({
  status: 'success',
  forwarded: params
}))

vi.mock('../../../llm-tools/agent-tools/call-agent-tool', () => ({
  callAgentToolName: 'call_agent',
  callAgentToolDefinition: {
    description: 'Call agent',
    inputSchema: {}
  },
  callAgent: (...params: unknown[]) => callAgentMock(...params)
}))

import { registerAgentTools } from './agent-tool-pack'

function createRegistry(): {
  registry: never
  entries: Map<
    string,
    { execute: (params: { args: unknown; chatId?: string }) => Promise<unknown> }
  >
} {
  const entries = new Map<
    string,
    { execute: (params: { args: unknown; chatId?: string }) => Promise<unknown> }
  >()
  return {
    registry: {
      register: (tool: {
        name: string
        execute: (params: { args: unknown; chatId?: string }) => Promise<unknown>
      }) => {
        entries.set(tool.name, { execute: tool.execute })
      }
    } as never,
    entries
  }
}

describe('registerAgentTools', () => {
  it('returns error when services are unavailable', async () => {
    const { registry, entries } = createRegistry()
    registerAgentTools(registry, {
      getAgentRegistryService: () => null,
      getOrchestrationService: () => null
    })

    const tool = entries.get('call_agent')
    const result = (await tool?.execute({
      args: { agent_id: 'a1', message: 'work' },
      chatId: 'chat-1'
    })) as { status: string; message: string }

    expect(result.status).toBe('error')
    expect(result.message).toContain('not properly configured')
  })

  it('enhances params with resolved agent name and delegates call', async () => {
    const { registry, entries } = createRegistry()
    const getAgentById = vi.fn(async (id: string) =>
      id === 'a1'
        ? {
            id: 'a1',
            name: 'Planner',
            description: 'Plans tasks',
            role: 'specialist',
            type: 'user-defined',
            capabilities: [
              {
                id: 'plan',
                name: 'Planning',
                description: 'Planning work',
                tools: ['query_knowledge_base']
              }
            ],
            promptConfig: {
              coreModules: [],
              agentModules: []
            },
            modelConfig: { provider: 'openai', model: 'gpt-4.1' },
            toolAccess: ['query_knowledge_base'],
            createdAt: '2026-03-23T00:00:00.000Z',
            updatedAt: '2026-03-23T00:00:00.000Z'
          }
        : null
    )
    const getAllAgents = vi.fn(async () => [
      {
        id: 'a1',
        name: 'Planner',
        description: 'Plans tasks',
        type: 'user-defined',
        capabilities: ['plan'],
        toolAccess: ['query_knowledge_base'],
        provider: 'openai',
        model: 'gpt-4.1',
        createdAt: '2026-03-23T00:00:00.000Z',
        updatedAt: '2026-03-23T00:00:00.000Z'
      }
    ])
    const agentRegistryService = { getAgentById, getAllAgents }
    const orchestrationService = { executeAgentWithPrompt: vi.fn() }

    registerAgentTools(registry, {
      getAgentRegistryService: () => agentRegistryService as never,
      getOrchestrationService: () => orchestrationService as never
    })

    const tool = entries.get('call_agent')
    const result = (await tool?.execute({
      args: { agent_handle: 'planner-a1', message: 'work' },
      chatId: 'chat-5'
    })) as { status: string }

    expect(result.status).toBe('success')
    expect(callAgentMock).toHaveBeenCalledWith(
      {
        agent_handle: 'planner-a1',
        agent_id: 'a1',
        message: 'work',
        agent_name: 'Planner'
      },
      'chat-5',
      agentRegistryService,
      orchestrationService
    )
  })
})
