import { z } from 'zod'
import { AgentRegistryService } from '../../services/agent-registry-service'
import { OrchestrationService } from '../../services/orchestration-service'
import { CALL_AGENT_TOOL_NAME } from '../../constants/llm-constants'
import { isOrchestratorAgent } from '../../../shared/utils/agent-utils'

// Define the tool name as a constant
export const callAgentToolName = CALL_AGENT_TOOL_NAME

// Define the parameter schema using zod
export const callAgentToolDefinition = {
  description:
    'Calls a specialized agent and returns its response. Use this tool to delegate specific tasks to agents with specialized capabilities.',
  inputSchema: z.object({
    message: z.string().describe('The message or task to send to the specialized agent'),
    agent_id: z.string().describe('The ID of the specialized agent to call')
  })
}

// Define the parameters interface
export interface CallAgentParams {
  message: string
  agent_id: string
  agent_name?: string // Optional agent name for UI display
}

// Export tool's main function
export async function callAgent(
  params: CallAgentParams,
  chatId: string,
  agentRegistryService: AgentRegistryService,
  orchestrationService: OrchestrationService
): Promise<any> {
  const { message, agent_id } = params

  try {
    // Validate agent exists
    const agent = await agentRegistryService.getAgentById(agent_id)
    if (!agent) {
      return {
        status: 'error',
        message: `Agent with ID "${agent_id}" not found.`,
        agent_id
      }
    }

    // Check if the agent is an orchestrator (to prevent recursive calls)
    const isOrchestrator = isOrchestratorAgent(agent)

    if (isOrchestrator) {
      return {
        status: 'error',
        message: `Cannot delegate to orchestrator agent "${agent.name}" (${agent_id}). Please select a specialized agent instead.`,
        agent_id,
        agent_name: agent.name
      }
    }

    // IMPORTANT: Detect recursive calls
    // Check if we're trying to call ourselves (detect if agent_id matches the current executing agent)
    const executingAgent = orchestrationService.getCurrentExecutingAgent(chatId)
    if (executingAgent && executingAgent === agent_id) {
      return {
        status: 'error',
        message: `Cannot delegate to agent "${agent.name}" (${agent_id}) because it is the currently executing agent. Please use the agent's tools directly.`,
        agent_id,
        agent_name: agent.name,
        error_type: 'recursive_call'
      }
    }

    // Execute the agent with the message

    // Execute agent and get structured response including tool results
    const result = await orchestrationService.executeAgentWithPrompt(agent_id, chatId, message)

    if (!result.success) {
      return {
        status: 'error',
        message: `Agent "${agent.name}" failed to process the request: ${result.error}`,
        agent_id,
        agent_name: agent.name,
        error: result.error
      }
    }

    // Return the response from the agent, including tool results if any
    const response: any = {
      status: 'success',
      message: `Agent "${agent.name}" processed the request successfully.`,
      agent_id,
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
      agent_id
    }
  }
}
