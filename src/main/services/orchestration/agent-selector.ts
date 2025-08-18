import type { AgentSelection, Subtask } from '../types/orchestration-types'
import type { AgentDefinition } from '../../../shared/types/agent-types'
import { IAgentSelector } from './types/orchestration-interfaces'
import { AgentRegistryService } from '../agent-registry-service'
import { isOrchestratorAgent } from '../../../../src/shared/utils/agent-utils'

export class AgentSelector implements IAgentSelector {
  constructor(private agentRegistryService: AgentRegistryService) {}

  public async getAvailableAgentsInfo(): Promise<string> {
    try {
      const allAgents = await this.agentRegistryService.getAllAgents()
      let agentInfoText = 'AVAILABLE SPECIALIZED AGENTS:\\n\\n'

      for (const agentEntry of allAgents) {
        const agentDef = await this.agentRegistryService.getAgentById(agentEntry.id)
        if (!agentDef) continue

        // Skip agents that are orchestrators (to avoid recursion)
        const isOrchestrator = isOrchestratorAgent(agentDef)

        if (!isOrchestrator) {
          const capabilitiesList = agentDef.capabilities
            .map((cap) => `- ${cap.name}: ${cap.description}`)
            .join('\\n')

          agentInfoText += `Agent: ${agentDef.name} (ID: ${agentDef.id})\\n`
          agentInfoText += `Description: ${agentDef.description || 'No description'}\\n`
          agentInfoText += `Capabilities:\\n${capabilitiesList}\\n\\n`
        }
      }

      return agentInfoText
    } catch (error) {
      return 'Error: Could not retrieve agent information.'
    }
  }

  public async selectAgentForSubtask(
    subtask: Subtask,
    orchestratorAgentId: string
  ): Promise<AgentSelection | null> {
    // Get all available agents
    const allAgents = await this.agentRegistryService.getAllAgents()

    if (allAgents.length === 0) {
      return null
    }

    // Filter out the orchestrator itself to avoid recursion, unless no other agent is available
    const candidateAgents = allAgents.filter((agent) => agent.id !== orchestratorAgentId)

    if (candidateAgents.length === 0) {
      return {
        agentId: orchestratorAgentId,
        confidence: 1,
        matchedCapabilities: []
      }
    }

    // Score each agent based on capability match
    const scoredAgents = await Promise.all(
      candidateAgents.map(async (agent) => {
        const agentDef = await this.agentRegistryService.getAgentById(agent.id)
        if (!agentDef) {
          return { agent, score: 0, matchedCapabilities: [] }
        }

        const matchedCapabilities = this.matchCapabilities(subtask.requiredCapabilities, agentDef)

        // Calculate score based on capability match percentage
        const capabilityScore =
          subtask.requiredCapabilities.length > 0
            ? matchedCapabilities.length / subtask.requiredCapabilities.length
            : 0.5 // Default score if no capabilities specified

        return {
          agent,
          score: capabilityScore,
          matchedCapabilities
        }
      })
    )

    // Sort by score (highest first)
    scoredAgents.sort((a, b) => b.score - a.score)

    // Select the highest scoring agent with at least some capability match
    const bestAgent = scoredAgents[0]
    if (bestAgent && bestAgent.score > 0) {
      return {
        agentId: bestAgent.agent.id,
        confidence: bestAgent.score,
        matchedCapabilities: bestAgent.matchedCapabilities
      }
    }

    // If no good match found, return null
    return null
  }

  public matchCapabilities(requiredCapabilities: string[], agent: AgentDefinition): string[] {
    const matchedCapabilities: string[] = []

    // If no capabilities required, consider it a match
    if (requiredCapabilities.length === 0) {
      return matchedCapabilities
    }

    // Check each required capability
    for (const required of requiredCapabilities) {
      // Check if any agent capability matches (by ID or name)
      const match = agent.capabilities.some(
        (cap) => cap.id === required || cap.name.toLowerCase() === required.toLowerCase()
      )

      if (match) {
        matchedCapabilities.push(required)
      }
    }

    return matchedCapabilities
  }
}
