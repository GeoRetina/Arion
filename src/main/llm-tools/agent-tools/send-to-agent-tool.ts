import { z } from 'zod'
import { AgentRegistryService } from '../../services/agent-registry-service'
import { OrchestrationService } from '../../services/orchestration-service'

// Define the tool name as a constant
export const sendToAgentToolName = 'send_to_agent'

// Define the parameter schema using zod
export const sendToAgentToolDefinition = {
  description:
    'Sends a message to a specialized agent and returns its response. Use this tool to delegate specific tasks to agents with specialized capabilities.',
  parameters: z.object({
    message: z.string().describe('The message or task to send to the specialized agent'),
    agent_id: z.string().describe('The ID of the specialized agent to send the message to')
  })
}

// Define the parameters interface
export interface SendToAgentParams {
  message: string
  agent_id: string
}

// Export tool's main function
export async function sendToAgent(
  params: SendToAgentParams,
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
    const isOrchestrator = agent.capabilities.some(
      (cap) =>
        cap.name.toLowerCase().includes('orchestrat') ||
        cap.description.toLowerCase().includes('orchestrat')
    )

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
      console.error(
        `[send_to_agent tool] Recursive call detected! Agent ${agent.name} (${agent_id}) is trying to call itself`
      )
      return {
        status: 'error',
        message: `Cannot delegate to agent "${agent.name}" (${agent_id}) because it is the currently executing agent. Please use the agent's tools directly.`,
        agent_id,
        agent_name: agent.name,
        error_type: 'recursive_call'
      }
    }

    // Execute the agent with the message
    console.log(`[send_to_agent tool] Delegating task to agent: ${agent.name} (${agent_id})`)
    console.log(`[send_to_agent tool] Message: ${message}`)

    // Execute agent and get response
    const result = await orchestrationService.executeAgentWithPrompt(agent_id, chatId, message)

    // Return the response from the agent
    return {
      status: 'success',
      message: `Agent "${agent.name}" processed the request successfully.`,
      agent_id,
      agent_name: agent.name,
      response: result
    }
  } catch (error) {
    console.error(`[send_to_agent tool] Error:`, error)
    return {
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Unknown error occurred when sending to agent',
      agent_id
    }
  }
}
