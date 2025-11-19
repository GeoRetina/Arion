import { convertToModelMessages, type ModelMessage } from 'ai'
import { SettingsService } from './settings-service'
import { ModularPromptManager } from './modular-prompt-manager'
import { AgentRegistryService } from './agent-registry-service'
import { AgentToolManager } from './agent-tool-manager'
import { getArionSystemPrompt } from '../constants/system-prompts'
import { createMCPToolDescription, type ToolDescription } from '../constants/tool-constants'
import { isOrchestratorAgent } from '../../../src/shared/utils/agent-utils'
import {
  normalizeRendererMessages,
  sanitizeModelMessages
} from './utils/message-normalizer'

export interface PreparedMessagesResult {
  processedMessages: ModelMessage[]
  finalSystemPrompt: string | null
}

export class MessagePreparationService {
  private settingsService: SettingsService
  private modularPromptManager: ModularPromptManager
  private agentRegistryService?: AgentRegistryService
  private llmToolService?: any // Will be injected to get MCP tools
  private agentToolManager?: AgentToolManager // Added for agent tool access

  constructor(
    settingsService: SettingsService,
    modularPromptManager: ModularPromptManager,
    agentRegistryService?: AgentRegistryService,
    llmToolService?: any,
    agentToolManager?: AgentToolManager
  ) {
    this.settingsService = settingsService
    this.modularPromptManager = modularPromptManager
    this.agentRegistryService = agentRegistryService
    this.llmToolService = llmToolService
    this.agentToolManager = agentToolManager
  }

  /**
   * Prepare messages and construct system prompt for LLM execution
   * @param rendererMessages Messages from the renderer process
   * @param chatId Optional chat ID for context
   * @param agentId Optional agent ID for agent-specific prompts
   * @returns Prepared messages and system prompt
   */
  async prepareMessagesAndSystemPrompt(
    rendererMessages: Array<any>,
    chatId?: string,
    agentId?: string
  ): Promise<PreparedMessagesResult> {
    const normalizedRendererMessages = normalizeRendererMessages(rendererMessages)

    // Convert only if messages are UI messages (have parts). If already ModelMessage, use as-is.
    let coreMessages: ModelMessage[]
    const messageAnalysis = this.analyzeRendererMessages(normalizedRendererMessages)

    try {
      coreMessages = messageAnalysis.shouldConvert
        ? (convertToModelMessages(normalizedRendererMessages as any) as unknown as ModelMessage[])
        : (normalizedRendererMessages as unknown as ModelMessage[])
      coreMessages = sanitizeModelMessages(coreMessages)
    } catch (e) {
      coreMessages = (normalizedRendererMessages as unknown as ModelMessage[]) || []
    }
    let finalSystemPrompt: string | null = null

    if (!coreMessages) {
      // Handle case where conversion might result in undefined/null if input is very unusual
      return { processedMessages: [], finalSystemPrompt: null }
    }

    // Construct the system prompt
    finalSystemPrompt = await this.constructSystemPrompt(chatId, agentId)

    // Remove any existing system message from coreMessages as it will be passed separately
    const { messages, systemPrompt } = this.removeExistingSystemMessage(
      coreMessages,
      finalSystemPrompt
    )
    coreMessages = messages
    finalSystemPrompt = systemPrompt

    return { processedMessages: coreMessages, finalSystemPrompt }
  }

  /**
   * Construct the system prompt for the LLM
   * @param chatId Optional chat ID for context
   * @param agentId Optional agent ID for agent-specific prompts
   * @returns Constructed system prompt or null if construction fails
   */
  private async constructSystemPrompt(chatId?: string, agentId?: string): Promise<string | null> {
    try {
      // Get MCP tools if available
      const mcpTools = await this.getMCPTools()
      
      // Get agent tool access list if available and agentId is provided
      let agentToolAccess: string[] | undefined = undefined
      
      // Use AgentToolManager if available to determine agent tool access
      if (this.agentToolManager) {
        try {
          if (agentId && this.agentRegistryService) {
            // For specific agent ID, check if it's an orchestrator or specialized agent
            const agent = await this.agentRegistryService.getAgentById(agentId)
            
            if (agent) {
              // Check if this is an orchestrator agent
              const isOrchestrator = isOrchestratorAgent(agent)
              
              if (isOrchestrator) {
                // For orchestrators, use the AgentToolManager to get tool names for orchestrator
                const orchestratorTools = await this.agentToolManager.getToolsForAgent(agentId)
                agentToolAccess = Object.keys(orchestratorTools)
              } else if (agent.toolAccess) {
                // For specialized agents, use their assigned tools
                agentToolAccess = agent.toolAccess
              }
            }
          } else {
            // No agent ID provided - treat as main orchestrator
            const orchestratorTools = await this.agentToolManager.getToolsForAgent()
            agentToolAccess = Object.keys(orchestratorTools)
          }
        } catch (error) {
          console.error('Error determining agent tool access:', error)
        }
      }

      // Get the dynamic system prompt with current MCP tools and agent tool access
      let baseSystemPrompt = getArionSystemPrompt(mcpTools, agentToolAccess)

      // Get user system prompt configuration and add if provided
      const systemPromptConfig = await this.settingsService.getSystemPromptConfig()
      if (systemPromptConfig.userSystemPrompt) {
        baseSystemPrompt = `${baseSystemPrompt}\n\n${systemPromptConfig.userSystemPrompt}`
      }

      // Get available agents information if the registry is available
      const availableAgentsInfo = await this.getAvailableAgentsInfo()

      // Use the modular prompt manager to get a system prompt if available
      let finalSystemPrompt = await this.getModularSystemPrompt(chatId, baseSystemPrompt, agentId)

      // Add available agents info to the system prompt if we have any
      if (availableAgentsInfo) {
        finalSystemPrompt += availableAgentsInfo
      }

      return finalSystemPrompt
    } catch (error) {
      return null
    }
  }

  /**
   * Get available MCP tools for dynamic system prompt generation
   * @returns Array of MCP tool descriptions
   */
  private async getMCPTools(): Promise<ToolDescription[]> {
    if (!this.llmToolService) {
      return []
    }

    try {
      // Get MCP tools through the LLM tool service
      const mcpTools = this.llmToolService.getMcpTools()
      if (!mcpTools || mcpTools.length === 0) {
        return []
      }

      // Convert MCP tools to ToolDescription format
      const toolDescriptions: ToolDescription[] = []
      for (const mcpTool of mcpTools) {
        const toolDesc = createMCPToolDescription(
          mcpTool.name,
          mcpTool.description || 'MCP tool with no description provided',
          mcpTool.serverName || 'Unknown Server'
        )
        toolDescriptions.push(toolDesc)
      }

      return toolDescriptions
    } catch (error) {
      return []
    }
  }

  /**
   * Get information about available agents for inclusion in system prompt
   * @returns Formatted string with agent information or empty string
   */
  private async getAvailableAgentsInfo(): Promise<string> {
    if (!this.agentRegistryService) {
      return ''
    }

    try {
      // Get all agents from the registry
      const allAgents = await this.agentRegistryService.getAllAgents()
      if (!allAgents || allAgents.length === 0) {
        return ''
      }

      let availableAgentsInfo = '\n\nAVAILABLE SPECIALIZED AGENTS:\n\n'

      // Process each agent to create a formatted agent info section
      for (const agentEntry of allAgents) {
        const agentDef = await this.agentRegistryService.getAgentById(agentEntry.id)
        if (!agentDef) continue

        // Skip agents that are orchestrators (to avoid recursion)
        const isOrchestrator = isOrchestratorAgent(agentDef)

        if (!isOrchestrator) {
          const capabilitiesList = agentDef.capabilities
            .map((cap) => `- ${cap.name}: ${cap.description}`)
            .join('\n')

          availableAgentsInfo += `Agent: ${agentDef.name} (ID: ${agentDef.id})\n`
          availableAgentsInfo += `Description: ${agentDef.description || 'No description'}\n`
          availableAgentsInfo += `Capabilities:\n${capabilitiesList}\n\n`
        }
      }

      return availableAgentsInfo
    } catch (error) {
      return ''
    }
  }

  /**
   * Get system prompt using modular prompt manager
   * @param chatId Chat ID for context
   * @param baseSystemPrompt Base system prompt to use as fallback
   * @param agentId Optional agent ID
   * @returns System prompt string
   */
  private async getModularSystemPrompt(
    chatId?: string,
    baseSystemPrompt?: string,
    agentId?: string
  ): Promise<string> {
    // Use the modular prompt manager to get a system prompt if available
    if (this.modularPromptManager) {
      try {
        const context = {
          chatId: chatId || 'default',
          timestamp: new Date().toISOString()
          // Add any other context that would be useful for prompt assembly
        }

        const moduleBasedPrompt = await this.modularPromptManager.getSystemPrompt(
          chatId || 'default',
          baseSystemPrompt || '',
          agentId,
          context
        )

        // Use the assembled prompt if it was successfully generated
        if (moduleBasedPrompt) {
          return moduleBasedPrompt
        } else {
          return baseSystemPrompt || ''
        }
      } catch (error) {
        return baseSystemPrompt || ''
      }
    } else {
      // No modular prompt manager available, use the base system prompt
      return baseSystemPrompt || ''
    }
  }

  /**
   * Remove existing system message from core messages array
   * @param coreMessages Array of core messages
   * @param finalSystemPrompt The constructed system prompt to use instead
   * @returns Object with processed messages and potentially updated system prompt
   */
  private removeExistingSystemMessage(
    coreMessages: ModelMessage[],
    finalSystemPrompt: string | null
  ): { messages: ModelMessage[]; systemPrompt: string | null } {
    let updatedSystemPrompt = finalSystemPrompt

    if (coreMessages.length > 0 && coreMessages[0].role === 'system') {
      // If a system message was already present, and we didn't construct one due to error,
      // we might want to use the original one. However, current logic aims to construct a new one.
      // For simplicity now, we prioritize the constructed finalSystemPrompt.
      // If finalSystemPrompt is null here (due to error), and there was an original system message,
      // that original system message will be removed and no system prompt will be passed via the 'system' property.
      // This behavior can be refined if needed.
      if (!finalSystemPrompt && coreMessages[0].content) {
        // Fallback: if we failed to build a new system prompt, but one existed, use the existing one.
        // This is a slight deviation to prevent losing an existing system prompt if construction fails.
        updatedSystemPrompt = coreMessages[0].content as string
      }
      coreMessages = coreMessages.slice(1) // Remove the first message (assumed to be system)
    }

    return { messages: coreMessages, systemPrompt: updatedSystemPrompt }
  }

  /**
   * Validate that messages are properly formatted
   * @param messages Messages to validate
   * @returns true if messages are valid, false otherwise
   */
  validateMessages(messages: ModelMessage[]): boolean {
    if (!messages || messages.length === 0) {
      return false
    }

    // Additional validation logic can be added here
    for (const message of messages) {
      if (!message.role || !message.content) {
        return false
      }
    }

    return true
  }

  /**
   * Get basic system prompt configuration
   * @returns System prompt configuration
   */
  async getSystemPromptConfig() {
    return await this.settingsService.getSystemPromptConfig()
  }

  private analyzeRendererMessages(rendererMessages: Array<any>) {
    if (!Array.isArray(rendererMessages) || rendererMessages.length === 0) {
      return {
        shouldConvert: false,
        convertReasons: [],
        logDetails: {
          totalMessages: Array.isArray(rendererMessages) ? rendererMessages.length : 0,
          indicatorCounts: { parts: 0, toolInvocations: 0 },
          recentMessages: []
        }
      }
    }

    const indicatorCounts = { parts: 0, toolInvocations: 0 }
    const messageSummaries = rendererMessages.map((message, index) => {
      const summary = this.createMessageSummaryForLog(message, index)
      if (summary.hasPartsProp) {
        indicatorCounts.parts += 1
      }
      if (summary.hasToolInvocationsProp) {
        indicatorCounts.toolInvocations += 1
      }
      return summary
    })

    const shouldConvert = indicatorCounts.parts > 0 || indicatorCounts.toolInvocations > 0
    const convertReasons: string[] = []
    if (indicatorCounts.parts > 0) {
      convertReasons.push('parts')
    }
    if (indicatorCounts.toolInvocations > 0) {
      convertReasons.push('toolInvocations')
    }

    return {
      shouldConvert,
      convertReasons,
      logDetails: {
        totalMessages: rendererMessages.length,
        indicatorCounts,
        recentMessages: messageSummaries.slice(-5)
      }
    }
  }

  private createMessageSummaryForLog(message: any, index: number) {
    const hasPartsProp = Boolean(message && typeof message === 'object' && 'parts' in message)
    const partsCount = Array.isArray(message?.parts) ? message.parts.length : undefined
    const hasToolInvocationsProp = Boolean(
      message && typeof message === 'object' && 'toolInvocations' in message
    )
    const toolInvocationCount = Array.isArray(message?.toolInvocations)
      ? message.toolInvocations.length
      : undefined

    return {
      index,
      role: message?.role,
      hasPartsProp,
      partsCount,
      hasToolInvocationsProp,
      toolInvocationCount,
      contentDescriptor: this.describeContentForLog(message?.content),
      partsPreview: Array.isArray(message?.parts)
        ? message.parts.slice(0, 3).map((part: any) => ({
            type: part?.type,
            state: part?.state,
            providerExecuted: part?.providerExecuted,
            hasResult: Boolean(part?.result),
            hasArgs: Boolean(part?.args)
          }))
        : undefined
    }
  }

  private describeContentForLog(content: any): string {
    if (content === null || content === undefined) {
      return 'nullish'
    }
    if (typeof content === 'string') {
      const trimmed = content.length > 60 ? `${content.slice(0, 57)}...` : content
      return `string(${content.length}):${trimmed}`
    }
    if (Array.isArray(content)) {
      const partTypes = content
        .slice(0, 3)
        .map((part) => (part?.type ? part.type : typeof part))
        .join(',')
      return `array(${content.length})[${partTypes}]`
    }
    if (typeof content === 'object') {
      return 'object'
    }
    return typeof content
  }

}
