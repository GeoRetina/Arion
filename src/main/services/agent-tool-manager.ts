import type { LlmToolService } from './llm-tool-service'
import { AgentRegistryService } from './agent-registry-service'
import { isOrchestratorAgent } from '../../../src/shared/utils/agent-utils'
import type { AgentDefinition } from '../../shared/types/agent-types'
import type { ToolSet } from 'ai'

export class AgentToolManager {
  private llmToolService: LlmToolService
  private agentRegistryService?: AgentRegistryService

  constructor(llmToolService: LlmToolService, agentRegistryService?: AgentRegistryService) {
    this.llmToolService = llmToolService
    this.agentRegistryService = agentRegistryService
  }

  /**
   * Get a list of tools that are assigned to specialized (non-orchestrator) agents
   * @returns Array of tool IDs that are assigned to specialized agents
   */
  async getToolsAssignedToSpecializedAgents(): Promise<string[]> {
    if (!this.agentRegistryService) {
      return []
    }

    try {
      // Get all agents
      const allAgents = await this.agentRegistryService.getAllAgents()
      const specializedAgentTools: string[] = []

      // Process each agent
      for (const agentEntry of allAgents) {
        const agent = await this.agentRegistryService.getAgentById(agentEntry.id)
        if (!agent) continue

        // Skip orchestrators
        const isOrchestrator = this.isOrchestratorAgent(agent)

        if (!isOrchestrator) {
          // Add all tools assigned to this specialized agent
          if (agent.toolAccess && agent.toolAccess.length > 0) {
            specializedAgentTools.push(...agent.toolAccess)
          }
        }
      }

      // Return unique tool IDs
      const uniqueTools = [...new Set(specializedAgentTools)]
      return uniqueTools
    } catch {
      return []
    }
  }

  /**
   * Check if an agent is an orchestrator based on its role
   * @param agent Agent definition to check
   * @returns boolean indicating if the agent is an orchestrator
   */
  public isOrchestratorAgent(agent: AgentDefinition | null | undefined): boolean {
    return isOrchestratorAgent(agent)
  }

  /**
   * Get appropriate tools for an agent based on agent type (orchestrator vs specialized)
   * @param agentId Optional agent ID to get tools for. If not provided, treats as main orchestrator.
   * @returns Object containing tool definitions suitable for the agent
   */
  async getToolsForAgent(agentId?: string): Promise<ToolSet> {
    let combinedTools: ToolSet = {}

    // Get ALL tools first
    const allTools = this.llmToolService.getToolDefinitionsForLLM() as ToolSet

    // Case 1: Specific agent is provided
    if (agentId && this.agentRegistryService) {
      const agent = await this.agentRegistryService.getAgentById(agentId)

      if (agent?.capabilities) {
        void 0
      }

      // Determine if this is an orchestrator
      const isOrchestrator = this.isOrchestratorAgent(agent)

      if (isOrchestrator) {
        combinedTools = await this.getOrchestratorTools(allTools)
      } else if (agent) {
        combinedTools = await this.getSpecializedAgentTools(agent)
      } else {
        // Agent not found, fall back to default tools
        return await this.getToolsForAgent() // Recursive call without agentId to get default tools
      }
    } else {
      // Case 2: No agent ID provided - treat as main orchestrator
      combinedTools = await this.getOrchestratorTools(allTools)
    }

    // Warn if no tools are provided

    return combinedTools
  }

  /**
   * Get tools for orchestrator agents (filtered to exclude specialized agent tools)
   * @param allTools All available tool definitions
   * @returns Filtered tools for orchestrator
   */
  private async getOrchestratorTools(allTools: ToolSet): Promise<ToolSet> {
    // For orchestrator: Filter out tools assigned to specialized agents
    const specializedAgentTools = await this.getToolsAssignedToSpecializedAgents()

    // Filter out tools that are assigned to specialized agents
    const combinedTools = Object.fromEntries(
      Object.entries(allTools).filter(([toolName]) => !specializedAgentTools.includes(toolName))
    ) as ToolSet

    return combinedTools
  }

  /**
   * Get tools for specialized agents (only their assigned tools)
   * @param agent The specialized agent definition
   * @returns Tools assigned to the specialized agent
   */
  private async getSpecializedAgentTools(
    agent: Pick<AgentDefinition, 'toolAccess'>
  ): Promise<ToolSet> {
    // For specialized agents: Use only their assigned tools

    if (Array.isArray(agent.toolAccess) && agent.toolAccess.length > 0) {
      // Get tools with the agent's specific tool access list
      const agentTools = this.llmToolService.getToolDefinitionsForLLM(agent.toolAccess) as ToolSet

      // Only exclude call_agent tool for specialized agents (to prevent recursion)
      const combinedTools = Object.fromEntries(
        Object.entries(agentTools).filter(
          ([toolName]) => toolName !== 'call_agent' // Explicitly prevent specialized agents from calling call_agent
        )
      ) as ToolSet
      return combinedTools
    } else {
      return {} // No tools assigned to this agent
    }
  }

  /**
   * Get all available tools from LlmToolService
   * @returns All tool definitions
   */
  getAllTools(): ToolSet {
    return this.llmToolService.getToolDefinitionsForLLM() as ToolSet
  }

  /**
   * Get tools for a specific tool access list
   * @param toolAccessList List of tool names to retrieve
   * @returns Tool definitions for the specified tools
   */
  getToolsForAccessList(toolAccessList: string[]): ToolSet {
    return this.llmToolService.getToolDefinitionsForLLM(toolAccessList) as ToolSet
  }
}
