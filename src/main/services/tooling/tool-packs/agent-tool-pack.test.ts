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
    const getAgentById = vi.fn(async () => ({ id: 'a1', name: 'Planner' }))
    const agentRegistryService = { getAgentById }
    const orchestrationService = { executeAgentWithPrompt: vi.fn() }

    registerAgentTools(registry, {
      getAgentRegistryService: () => agentRegistryService as never,
      getOrchestrationService: () => orchestrationService as never
    })

    const tool = entries.get('call_agent')
    const result = (await tool?.execute({
      args: { agent_id: 'a1', message: 'work' },
      chatId: 'chat-5'
    })) as { status: string }

    expect(result.status).toBe('success')
    expect(callAgentMock).toHaveBeenCalledWith(
      { agent_id: 'a1', message: 'work', agent_name: 'Planner' },
      'chat-5',
      agentRegistryService,
      orchestrationService
    )
  })
})
