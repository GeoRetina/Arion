import {
  callAgentToolDefinition,
  callAgentToolName,
  type CallAgentParams
} from '../../../llm-tools/agent-tools/call-agent-tool'
import type { ToolRegistry } from '../tool-registry'
import type { AgentRegistryService } from '../../agent-registry-service'
import type { OrchestrationService } from '../../orchestration-service'
import {
  loadSpecialistAgentDirectory,
  resolveSpecialistAgentReference
} from '../../utils/specialist-agent-directory'

export interface AgentToolDependencies {
  getAgentRegistryService: () => AgentRegistryService | null
  getOrchestrationService: () => OrchestrationService | null
}

export function registerAgentTools(registry: ToolRegistry, deps: AgentToolDependencies): void {
  registry.register({
    name: callAgentToolName,
    definition: callAgentToolDefinition,
    category: 'agent_communication',
    execute: async ({ args, chatId }) => {
      const agentRegistryService = deps.getAgentRegistryService()
      const orchestrationService = deps.getOrchestrationService()
      if (!agentRegistryService || !orchestrationService) {
        return {
          status: 'error',
          message: 'Agent services are not properly configured. Cannot delegate to other agents.'
        }
      }

      try {
        const params = args as CallAgentParams
        const actualChatId = chatId || 'unknown'

        let enhancedParams = params
        const requestedReference = (params.agent_handle || params.agent_id || '').trim()
        if (requestedReference) {
          try {
            const specialistDirectory = await loadSpecialistAgentDirectory(agentRegistryService)
            const resolvedReference = resolveSpecialistAgentReference(
              requestedReference,
              specialistDirectory
            )

            if (!('error' in resolvedReference)) {
              enhancedParams = {
                ...params,
                agent_handle: resolvedReference.entry.handle,
                agent_id: resolvedReference.entry.id,
                agent_name: resolvedReference.entry.name
              }
            }
          } catch {
            // Ignore lookup errors and fall back to provided params
          }
        }

        const { callAgent } = await import('../../../llm-tools/agent-tools/call-agent-tool')

        return await callAgent(
          enhancedParams,
          actualChatId,
          agentRegistryService,
          orchestrationService
        )
      } catch (error) {
        return {
          status: 'error',
          message: `Error delegating to agent: ${error instanceof Error ? error.message : 'Unknown error'}.`
        }
      }
    }
  })
}
