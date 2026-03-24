import { z } from 'zod'
import { AgentRegistryService } from '../../services/agent-registry-service'
import { OrchestrationService } from '../../services/orchestration-service'
import { CALL_AGENT_TOOL_NAME } from '../../constants/llm-constants'
import { isOrchestratorAgent } from '../../../shared/utils/agent-utils'
import {
  loadSpecialistAgentDirectory,
  resolveSpecialistAgentReference
} from '../../services/utils/specialist-agent-directory'

// Define the tool name as a constant
export const callAgentToolName = CALL_AGENT_TOOL_NAME

// Define the parameter schema using zod
export const callAgentToolDefinition = {
  description:
    'Calls a specialized agent and returns its response. Use only exact agent_handle values from the AVAILABLE SPECIALIZED AGENTS list. Never invent agent handles or IDs.',
  inputSchema: z
    .object({
      message: z.string().describe('The message or task to send to the specialized agent'),
      agent_handle: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          'The exact agent_handle of the specialized agent to call. Use only handles from the AVAILABLE SPECIALIZED AGENTS list.'
        ),
      agent_id: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe('Legacy fallback. Prefer agent_handle instead of raw IDs.')
    })
    .refine((value) => Boolean(value.agent_handle || value.agent_id), {
      message: 'Either agent_handle or agent_id is required.',
      path: ['agent_handle']
    })
}

// Define the parameters interface
export interface CallAgentParams {
  message: string
  agent_handle?: string
  agent_id?: string
  agent_name?: string // Optional agent name for UI display
}

// Export tool's main function
export async function callAgent(
  params: CallAgentParams,
  chatId: string,
  agentRegistryService: AgentRegistryService,
  orchestrationService: OrchestrationService
): Promise<unknown> {
  const { message, agent_handle, agent_id } = params
  const requestedReference = (agent_handle || agent_id || '').trim()

  try {
    const specialistDirectory = await loadSpecialistAgentDirectory(agentRegistryService)
    if (specialistDirectory.length === 0) {
      return {
        status: 'error',
        message:
          'No specialized agents are currently available. Do not attempt to delegate this request.',
        agent_handle: agent_handle || null,
        agent_id: agent_id || null
      }
    }

    const resolvedReference = resolveSpecialistAgentReference(
      requestedReference,
      specialistDirectory
    )
    if ('error' in resolvedReference) {
      if (resolvedReference.error === 'ambiguous') {
        const matchingHandles = resolvedReference.matches?.map((entry) => entry.handle).join(', ')
        return {
          status: 'error',
          message: `Specialized agent reference "${requestedReference}" is ambiguous. Use an exact agent_handle from the available agents list: ${matchingHandles}.`,
          agent_handle: agent_handle || null,
          agent_id: agent_id || null
        }
      }

      return {
        status: 'error',
        message: `Specialized agent "${requestedReference}" was not found. Use an exact agent_handle from the AVAILABLE SPECIALIZED AGENTS list.`,
        agent_handle: agent_handle || null,
        agent_id: agent_id || null
      }
    }

    const resolvedAgentId = resolvedReference.entry.id
    const resolvedAgentHandle = resolvedReference.entry.handle

    // Validate agent exists
    const agent = await agentRegistryService.getAgentById(resolvedAgentId)
    if (!agent) {
      return {
        status: 'error',
        message: `Specialized agent "${requestedReference}" was resolved, but the backing agent record was not found.`,
        agent_handle: resolvedAgentHandle,
        agent_id: resolvedAgentId
      }
    }

    // Check if the agent is an orchestrator (to prevent recursive calls)
    const isOrchestrator = isOrchestratorAgent(agent)

    if (isOrchestrator) {
      return {
        status: 'error',
        message: `Cannot delegate to orchestrator agent "${agent.name}" (${resolvedAgentId}). Please select a specialized agent instead.`,
        agent_id: resolvedAgentId,
        agent_handle: resolvedAgentHandle,
        agent_name: agent.name
      }
    }

    // IMPORTANT: Detect recursive calls
    // Check if we're trying to call ourselves (detect if agent_id matches the current executing agent)
    const executingAgent = orchestrationService.getCurrentExecutingAgent(chatId)
    if (executingAgent && executingAgent === resolvedAgentId) {
      return {
        status: 'error',
        message: `Cannot delegate to agent "${agent.name}" (${resolvedAgentId}) because it is the currently executing agent. Please use the agent's tools directly.`,
        agent_id: resolvedAgentId,
        agent_handle: resolvedAgentHandle,
        agent_name: agent.name,
        error_type: 'recursive_call'
      }
    }

    // Execute the agent with the message

    // Execute agent and get structured response including tool results
    const result = await orchestrationService.executeAgentWithPrompt(
      resolvedAgentId,
      chatId,
      message
    )

    if (!result.success) {
      return {
        status: 'error',
        message: `Agent "${agent.name}" failed to process the request: ${result.error}`,
        agent_id: resolvedAgentId,
        agent_handle: resolvedAgentHandle,
        agent_name: agent.name,
        error: result.error
      }
    }

    // Return the response from the agent, including tool results if any
    const response: Record<string, unknown> = {
      status: 'success',
      message: `Agent "${agent.name}" processed the request successfully.`,
      agent_id: resolvedAgentId,
      agent_handle: resolvedAgentHandle,
      agent_name: agent.name,
      response: result.textResponse
    }

    // Include tool results if the agent executed any tools
    if (result.toolResults && result.toolResults.length > 0) {
      response.toolResults = result.toolResults
    }

    return response
  } catch (error) {
    return {
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Unknown error occurred when sending to agent',
      agent_handle: agent_handle || null,
      agent_id: agent_id || null
    }
  }
}
