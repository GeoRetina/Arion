import { PromptModuleService } from './prompt-module-service'
import { AgentRegistryService } from './agent-registry-service'
import { PromptAssemblyRequest } from '../../shared/types/prompt-types'
import { SkillPackService } from './skill-pack-service'

/**
 * Manager class for handling modular prompts in the chat system
 * Acts as a bridge between ChatService and the prompt/agent services
 */
export class ModularPromptManager {
  private promptModuleService: PromptModuleService
  private agentRegistryService: AgentRegistryService
  private skillPackService?: SkillPackService
  private initialized = false

  constructor(
    promptModuleService: PromptModuleService,
    agentRegistryService: AgentRegistryService,
    skillPackService?: SkillPackService
  ) {
    this.promptModuleService = promptModuleService
    this.agentRegistryService = agentRegistryService
    this.skillPackService = skillPackService
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
    context?: Record<string, unknown>
  ): Promise<string> {
    await this.ensureInitialized()

    let basePrompt = defaultSystemPrompt

    try {
      // If an agent ID is provided, use that agent's prompt configuration
      if (agentId) {
        const agent = await this.agentRegistryService.getAgentById(agentId)

        if (!agent) {
          return this.withSkillSections(basePrompt, context)
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

        basePrompt = result.assembledPrompt
      }

      return this.withSkillSections(basePrompt, context)
    } catch {
      return this.withSkillSections(defaultSystemPrompt, context)
    }
  }

  private withSkillSections(basePrompt: string, context?: Record<string, unknown>): string {
    if (!this.skillPackService) {
      return basePrompt
    }

    try {
      const recentUserMessages = this.readStringArray(context?.recentUserMessages)
      const explicitSkillIds = this.readStringArray(context?.explicitSkillIds)
      const disabledSkillIds = this.readStringArray(context?.disabledSkillIds)
      const workspaceRoot =
        typeof context?.workspaceRoot === 'string' ? context.workspaceRoot : undefined

      const skillSections = this.skillPackService.buildPromptSections({
        workspaceRoot,
        recentUserMessages,
        explicitSkillIds,
        disabledSkillIds
      })

      const additions = [
        skillSections.compactIndexSection,
        skillSections.selectedInstructionSection
      ]
        .filter((section) => section.trim().length > 0)
        .join('\n\n')

      if (!additions) {
        return basePrompt
      }

      if (!basePrompt.trim()) {
        return additions
      }

      return `${basePrompt}\n\n${additions}`
    } catch {
      return basePrompt
    }
  }

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return []
    }

    return value.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0
    )
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
