import { PromptModuleService } from './prompt-module-service'
import { AgentRegistryService } from './agent-registry-service'
import { PromptAssemblyRequest } from '../../shared/types/prompt-types'

/**
 * Manager class for handling modular prompts in the chat system
 * Acts as a bridge between ChatService and the prompt/agent services
 */
export class ModularPromptManager {
  private promptModuleService: PromptModuleService
  private agentRegistryService: AgentRegistryService
  private initialized = false

  constructor(
    promptModuleService: PromptModuleService,
    agentRegistryService: AgentRegistryService
  ) {
    this.promptModuleService = promptModuleService
    this.agentRegistryService = agentRegistryService
  }

  /**
   * Initialize the manager and dependent services
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    // Initialize dependent services
    await this.promptModuleService.initialize()
    await this.agentRegistryService.initialize()

    this.initialized = true
  }

  /**
   * Get a system prompt for a chat session
   * Falls back to legacy system prompt if modular prompt assembly fails
   */
  public async getSystemPrompt(
    chatId: string,
    defaultSystemPrompt: string,
    agentId?: string,
    context?: Record<string, UnsafeAny>
  ): Promise<string> {
    await this.ensureInitialized()

    try {
      // If an agent ID is provided, use that agent's prompt configuration
      if (agentId) {
        const agent = await this.agentRegistryService.getAgentById(agentId)

        if (!agent) {
          return defaultSystemPrompt
        }

        const assemblyRequest: PromptAssemblyRequest = {
          coreModules: agent.promptConfig.coreModules.map((m) => ({
            moduleId: m.moduleId,
            parameters: m.parameters || {}
          })),
          taskModules: agent.promptConfig.taskModules?.map((m) => ({
            moduleId: m.moduleId,
            parameters: m.parameters || {}
          })),
          agentModules: agent.promptConfig.agentModules.map((m) => ({
            moduleId: m.moduleId,
            parameters: m.parameters || {}
          })),
          ruleModules: agent.promptConfig.ruleModules?.map((m) => ({
            moduleId: m.moduleId,
            parameters: m.parameters || {}
          })),
          context: {
            ...context,
            chatId,
            agentId,
            agentName: agent.name,
            agentType: agent.type,
            modelProvider: agent.modelConfig.provider,
            modelName: agent.modelConfig.model,
            toolAccess: agent.toolAccess
          }
        }

        const result = await this.promptModuleService.assemblePrompt(assemblyRequest)

        if (result.warnings && result.warnings.length > 0) {
          void 0
        }

        return result.assembledPrompt
      }

      // For now, if no agent ID is provided, return the default prompt
      // In the future, this could be extended to use default modules
      return defaultSystemPrompt
    } catch {
      return defaultSystemPrompt
    }
  }

  /**
   * Ensure the manager is initialized before operations
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }
  }
}
