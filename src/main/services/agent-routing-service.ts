import { AgentRegistryService } from './agent-registry-service'
import { ChatService } from './chat-service'
import { LlmToolService } from './llm-tool-service'

import { type Subtask, type OrchestrationResult } from './types/orchestration-types'
import { OrchestrationService } from './orchestration-service'

/**
 * Service for intelligent agent routing and orchestration
 */
export class AgentRoutingService {
  private agentRegistryService: AgentRegistryService
  private chatService: ChatService
  private orchestrationService: OrchestrationService
  // LlmToolService might be useful in future extensions
  private initialized = false

  constructor(
    agentRegistryService: AgentRegistryService,
    chatService: ChatService,
    llmToolService: LlmToolService
  ) {
    this.agentRegistryService = agentRegistryService
    this.chatService = chatService
    this.orchestrationService = new OrchestrationService(
      agentRegistryService,
      chatService,
      llmToolService
    )
  }

  /**
   * Initialize the routing service
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.orchestrationService.initialize()
    // Ensure dependent services are initialized
    // These services will handle their own initialization if needed
    await this.agentRegistryService.initialize()
    // chatService and llmToolService are expected to be initialized by the main process

    this.initialized = true
  }

  /**
   * Main method to orchestrate a task using multiple agents
   */
  public async orchestrateTask(
    query: string,
    chatId: string,
    orchestratorAgentId: string
  ): Promise<OrchestrationResult> {
    return this.orchestrationService.orchestrateTask(query, chatId, orchestratorAgentId)
  }

  /**
   * Get agent capabilities with associated agents
   */
  public async getAgentCapabilities(): Promise<{
    success: boolean
    capabilities: any[]
    error?: string
  }> {
    await this.ensureInitialized()

    try {
      const allAgents = await this.agentRegistryService.getAllAgents()
      const capabilityMap = new Map<
        string,
        { id: string; name: string; description: string; agents: string[] }
      >()

      // Build a map of all capabilities across all agents
      for (const agent of allAgents) {
        const agentDef = await this.agentRegistryService.getAgentById(agent.id)
        if (!agentDef) continue

        for (const capability of agentDef.capabilities) {
          const capId = capability.id
          if (!capabilityMap.has(capId)) {
            capabilityMap.set(capId, {
              id: capability.id,
              name: capability.name,
              description: capability.description,
              agents: [agent.id]
            })
          } else {
            capabilityMap.get(capId)!.agents.push(agent.id)
          }
        }
      }

      return {
        success: true,
        capabilities: Array.from(capabilityMap.values())
      }
    } catch (error) {
      return {
        success: false,
        capabilities: [],
        error: error instanceof Error ? error.message : 'Unknown error getting capabilities'
      }
    }
  }

  /**
   * Get the status of orchestration sessions
   */
  public async getOrchestrationStatus(sessionId?: string): Promise<{
    success: boolean
    activeSessions?: string[]
    subtasks?: Record<string, Subtask[]>
    error?: string
  }> {
    return this.orchestrationService.getOrchestrationStatus(sessionId)
  }

  /**
   * Find or determine an appropriate orchestrator agent based on a model or agent ID
   * @param modelOrAgentId The model name or agent ID to use
   * @returns The ID of an appropriate orchestrator agent
   */
  public async findOrchestrator(modelOrAgentId: string): Promise<string> {
    await this.ensureInitialized()

    // First, check if the ID is an existing agent with orchestrator capabilities
    const agent = await this.agentRegistryService.getAgentById(modelOrAgentId)
    if (agent) {
      // Check if it has orchestrator capabilities
      const isOrchestrator = agent.capabilities.some(
        (cap) =>
          cap.name.toLowerCase().includes('orchestrat') ||
          cap.description.toLowerCase().includes('orchestrat')
      )

      if (isOrchestrator) {
        return modelOrAgentId // It's an orchestrator agent, use it directly
      }
    }

    // If not a direct match, find orchestrators from registry
    const allAgents = await this.agentRegistryService.getAllAgents()

    interface OrchestratorInfo {
      id: string
      isModelMatch: boolean
    }

    const orchestrators: OrchestratorInfo[] = []

    // Find agents with orchestrator capabilities
    for (const agentEntry of allAgents) {
      const agentDef = await this.agentRegistryService.getAgentById(agentEntry.id)
      if (!agentDef) continue

      const isOrchestrator = agentDef.capabilities.some(
        (cap) =>
          cap.name.toLowerCase().includes('orchestrat') ||
          cap.description.toLowerCase().includes('orchestrat')
      )

      // Check if this agent can handle the model
      const modelMatch = agentDef.modelConfig?.model?.toLowerCase() === modelOrAgentId.toLowerCase()

      if (isOrchestrator) {
        orchestrators.push({
          id: agentDef.id,
          isModelMatch: modelMatch
        })
      }
    }

    // If we have orchestrators that match the model, use the first one
    const modelMatchingOrchestrator = orchestrators.find((o) => o.isModelMatch)
    if (modelMatchingOrchestrator) {
      return modelMatchingOrchestrator.id
    }

    // Otherwise use any orchestrator if available
    if (orchestrators.length > 0) {
      return orchestrators[0].id
    }

    // If no orchestrators found, throw an error
    throw new Error('No suitable orchestrator agent found')
  }

  /**
   * Ensure the service is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }
  }

  public getExecutionContext(sessionId: string) {
    return this.orchestrationService.getExecutionContext(sessionId)
  }

  /**
   * Get the internal orchestration service instance
   */
  public getOrchestrationService(): OrchestrationService {
    return this.orchestrationService
  }
}
