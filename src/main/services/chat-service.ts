import { type CoreMessage } from 'ai'
import { ModularPromptManager } from './modular-prompt-manager'
import { SettingsService } from './settings-service'
import type { LlmToolService } from './llm-tool-service'
import { AgentRegistryService } from './agent-registry-service'
import { LLMProviderFactory } from './llm-provider-factory'
import { AgentToolManager } from './agent-tool-manager'
import { MessagePreparationService } from './message-preparation-service'
import {
  StreamingHandlerService,
  type StreamingCallbacks,
  type StructuredExecutionResult
} from './streaming-handler-service'

// Interface for the request body from the renderer
interface ChatRequestBody {
  messages: CoreMessage[] // Using CoreMessage from 'ai' SDK
  // Potentially other properties like model, id, etc. depending on useChat configuration
}

// Re-export types for backward compatibility
export type { StreamingCallbacks } from './streaming-handler-service'

export class ChatService {
  private llmProviderFactory: LLMProviderFactory
  private agentToolManager: AgentToolManager
  private messagePreparationService: MessagePreparationService
  private streamingHandlerService: StreamingHandlerService
  private llmToolService: LlmToolService

  constructor(
    settingsService: SettingsService,
    llmToolService: LlmToolService,
    modularPromptManager: ModularPromptManager,
    agentRegistryService?: AgentRegistryService
  ) {
    this.llmToolService = llmToolService

    // Initialize the new services
    this.llmProviderFactory = new LLMProviderFactory(settingsService, agentRegistryService)
    this.agentToolManager = new AgentToolManager(llmToolService, agentRegistryService)
    this.messagePreparationService = new MessagePreparationService(
      settingsService,
      modularPromptManager,
      agentRegistryService
    )
    this.streamingHandlerService = new StreamingHandlerService()
  }

  /**
   * Execute agent and collect structured result including both text and tool results
   * Used by OrchestrationService to preserve tool results from specialized agents
   */
  async executeAgentWithStructuredResult(
    messages: CoreMessage[],
    chatId: string,
    agentId?: string
  ): Promise<StructuredExecutionResult> {
    // Set the chat ID in the LlmToolService for permission tracking
    if (chatId) {
      this.llmToolService.setCurrentChatId(chatId)
    }

    try {
      const { processedMessages, finalSystemPrompt } =
        await this.messagePreparationService.prepareMessagesAndSystemPrompt(
          messages,
          chatId,
          agentId
        )

      if (!processedMessages || processedMessages.length === 0) {
        if (!finalSystemPrompt) {
          return {
            textResponse: '',
            toolResults: [],
            success: false,
            error: 'No messages or system prompt for execution after preparation step.'
          }
        }
      }

      // Create LLM using agent-specific configuration or global settings
      const llm = await this.llmProviderFactory.createLLMFromAgentConfig(agentId)
      const llmConfig = await this.llmProviderFactory.getLLMConfig(agentId)

      // Get appropriate tools for this agent (or main orchestrator if no agent ID)
      const combinedTools = await this.agentToolManager.getToolsForAgent(agentId)

      // Execute streaming with structured result
      return await this.streamingHandlerService.executeWithStructuredResult({
        model: llm,
        messages: processedMessages,
        system: finalSystemPrompt || '',
        tools: combinedTools,
        providerId: llmConfig.provider
      })
    } catch (error) {
      return {
        textResponse: '',
        toolResults: [],
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error in structured execution'
      }
    }
  }

  async handleSendMessageStream(
    body: ChatRequestBody & { id?: string; agentId?: string }
  ): Promise<Uint8Array[]> {
    const { messages: rendererMessages, agentId } = body

    // Set the chat ID in the LlmToolService for permission tracking
    if (body.id) {
      this.llmToolService.setCurrentChatId(body.id)
    }
    const textEncoder = new TextEncoder()

    try {
      const { processedMessages, finalSystemPrompt } =
        await this.messagePreparationService.prepareMessagesAndSystemPrompt(
          rendererMessages,
          body.id,
          agentId
        )

      if (!processedMessages || processedMessages.length === 0) {
        if (!finalSystemPrompt) {
          // Only error if there's no system prompt to guide an empty message list either
          return [
            textEncoder.encode(
              JSON.stringify({
                streamError: 'No messages or system prompt to send after preparation.'
              })
            )
          ]
        }
      }

      if (!processedMessages || processedMessages.length === 0) {
        return [
          textEncoder.encode(JSON.stringify({ streamError: 'Cannot process empty message list.' }))
        ]
      }

      // Create LLM using agent-specific configuration or global settings
      const llm = await this.llmProviderFactory.createLLMFromAgentConfig(agentId)

      // Get appropriate tools for this agent (or main orchestrator if no agent ID)
      const combinedTools = await this.agentToolManager.getToolsForAgent(agentId)

      // Handle streaming as chunks
      return await this.streamingHandlerService.handleStreamAsChunks({
        model: llm,
        messages: processedMessages,
        system: finalSystemPrompt || '',
        tools: combinedTools
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
      return [textEncoder.encode(JSON.stringify({ streamError: errorMessage }))]
    }
  }

  /**
   * Real-time streaming that sends chunks as they arrive
   * Uses callbacks to send data immediately as it becomes available
   */
  async handleStreamingMessage(
    body: ChatRequestBody & { id?: string; agentId?: string },
    callbacks: StreamingCallbacks,
    abortSignal?: AbortSignal
  ): Promise<void> {
    const { messages: rendererMessages, agentId } = body

    // Set the chat ID in the LlmToolService for permission tracking
    if (body.id) {
      this.llmToolService.setCurrentChatId(body.id)
    }

    try {
      const { processedMessages, finalSystemPrompt } =
        await this.messagePreparationService.prepareMessagesAndSystemPrompt(
          rendererMessages,
          body.id,
          agentId
        )

      if (!processedMessages || processedMessages.length === 0) {
        if (!finalSystemPrompt) {
          callbacks.onError(
            new Error('No messages or system prompt for streaming after preparation.')
          )
          callbacks.onComplete()
          return
        }
      }

      // Create LLM using agent-specific configuration or global settings
      const llm = await this.llmProviderFactory.createLLMFromAgentConfig(agentId)
      const llmConfig = await this.llmProviderFactory.getLLMConfig(agentId)

      // Get appropriate tools for this agent (or main orchestrator if no agent ID)
      const combinedTools = await this.agentToolManager.getToolsForAgent(agentId)

      // Handle real-time streaming
      await this.streamingHandlerService.handleRealTimeStreaming(
        {
          model: llm,
          messages: processedMessages,
          system: finalSystemPrompt || '',
          tools: combinedTools,
          providerId: llmConfig.provider,
          abortSignal
        },
        callbacks
      )
    } catch (error) {
      callbacks.onError(
        error instanceof Error ? error : new Error('Unknown error in streaming handler')
      )
      callbacks.onComplete()
    }
  }

  /**
   * Get LLM configuration for debugging/diagnostics
   * @param agentId Optional agent ID
   * @returns LLM provider configuration
   */
  async getLLMConfig(agentId?: string) {
    return await this.llmProviderFactory.getLLMConfig(agentId)
  }

  /**
   * Get tools for an agent for debugging/diagnostics
   * @param agentId Optional agent ID
   * @returns Tools available for the agent
   */
  async getAvailableTools(agentId?: string) {
    return await this.agentToolManager.getToolsForAgent(agentId)
  }

  /**
   * Validate messages before processing
   * @param messages Messages to validate
   * @returns true if valid, false otherwise
   */
  validateMessages(messages: CoreMessage[]): boolean {
    return this.messagePreparationService.validateMessages(messages)
  }
}
