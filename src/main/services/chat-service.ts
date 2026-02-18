import { type ModelMessage } from 'ai'
import { ModularPromptManager } from './modular-prompt-manager'
import { SettingsService } from './settings-service'
import type { LlmToolService } from './llm-tool-service'
import { AgentRegistryService } from './agent-registry-service'
import { LLMProviderFactory, type LLMProviderConfig } from './llm-provider-factory'
import { AgentToolManager } from './agent-tool-manager'
import { MessagePreparationService } from './message-preparation-service'
import type { KnowledgeBaseService } from './knowledge-base-service'
import {
  StreamingHandlerService,
  type StreamingCallbacks,
  type StructuredExecutionResult
} from './streaming-handler-service'

// Interface for the request body from the renderer
interface ChatRequestBody {
  messages: ModelMessage[] // Using ModelMessage from 'ai' SDK
  // Potentially other properties like model, id, etc. depending on useChat configuration
}

interface ToolOutcomeCapture {
  toolName: string
  toolCallId?: string
  args?: unknown
  result?: unknown
  error?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function extractTextFromParts(parts: unknown[]): string {
  return parts
    .map((part) => {
      const partRecord = asRecord(part)
      if (!partRecord) {
        return ''
      }

      if (partRecord.type === 'text' && typeof partRecord.text === 'string') {
        return partRecord.text
      }

      if (typeof partRecord.content === 'string') {
        return partRecord.content
      }

      return ''
    })
    .filter((text) => text.length > 0)
    .join('')
}

function extractMessageText(message: unknown): string {
  const messageRecord = asRecord(message)
  if (!messageRecord) {
    return ''
  }

  if (typeof messageRecord.content === 'string') {
    return messageRecord.content
  }

  if (Array.isArray(messageRecord.content)) {
    const fromContent = extractTextFromParts(messageRecord.content)
    if (fromContent) {
      return fromContent
    }
  }

  if (Array.isArray(messageRecord.parts)) {
    return extractTextFromParts(messageRecord.parts)
  }

  return ''
}

function extractToolOutcomes(message: unknown): ToolOutcomeCapture[] {
  const messageRecord = asRecord(message)
  if (!messageRecord || !Array.isArray(messageRecord.parts)) {
    return []
  }

  const toolOutcomes: ToolOutcomeCapture[] = []

  for (const part of messageRecord.parts) {
    const partRecord = asRecord(part)
    if (!partRecord || typeof partRecord.type !== 'string') {
      continue
    }

    if (partRecord.type === 'tool-invocation') {
      const invocationRecord =
        (asRecord(partRecord.toolInvocation) as Record<string, unknown> | null) || partRecord
      const toolNameRaw = invocationRecord.toolName || invocationRecord.tool
      const toolName = typeof toolNameRaw === 'string' ? toolNameRaw : undefined
      const toolCallIdRaw = invocationRecord.toolCallId || invocationRecord.id
      const toolCallId = typeof toolCallIdRaw === 'string' ? toolCallIdRaw : undefined
      const result = invocationRecord.result
      const error = typeof invocationRecord.error === 'string' ? invocationRecord.error : undefined
      const args = invocationRecord.args ?? invocationRecord.input

      if (!toolName || (result === undefined && !error)) {
        continue
      }

      toolOutcomes.push({
        toolName,
        toolCallId,
        args,
        result,
        error
      })
      continue
    }

    if (partRecord.type === 'dynamic-tool' || partRecord.type.startsWith('tool-')) {
      const typeBasedName =
        partRecord.type === 'dynamic-tool' ? undefined : partRecord.type.replace(/^tool-/, '')
      const toolNameRaw = partRecord.toolName || typeBasedName
      const toolName = typeof toolNameRaw === 'string' ? toolNameRaw : undefined
      const toolCallIdRaw = partRecord.toolCallId || partRecord.id
      const toolCallId = typeof toolCallIdRaw === 'string' ? toolCallIdRaw : undefined
      const result = partRecord.output

      let error: string | undefined
      if (typeof partRecord.errorText === 'string') {
        error = partRecord.errorText
      } else if (typeof partRecord.error === 'string') {
        error = partRecord.error
      } else {
        const approval = asRecord(partRecord.approval)
        if (approval?.approved === false) {
          error =
            typeof approval.reason === 'string'
              ? approval.reason
              : 'Tool approval was denied by policy.'
        }
      }

      if (!toolName || (result === undefined && !error)) {
        continue
      }

      toolOutcomes.push({
        toolName,
        toolCallId,
        args: partRecord.input ?? partRecord.rawInput,
        result,
        error
      })
    }
  }

  return toolOutcomes
}

function createContentHash(value: string): string {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash.toString(16)
}

function truncateText(value: string, maxLength: number = 220): string {
  if (value.length <= maxLength) {
    return value
  }
  return `${value.slice(0, maxLength - 3)}...`
}

// Re-export types for backward compatibility
export type { StreamingCallbacks } from './streaming-handler-service'

export class ChatService {
  private llmProviderFactory: LLMProviderFactory
  private agentToolManager: AgentToolManager
  private messagePreparationService: MessagePreparationService
  private streamingHandlerService: StreamingHandlerService
  private llmToolService: LlmToolService
  private knowledgeBaseService?: KnowledgeBaseService

  constructor(
    settingsService: SettingsService,
    llmToolService: LlmToolService,
    modularPromptManager: ModularPromptManager,
    agentRegistryService?: AgentRegistryService,
    knowledgeBaseService?: KnowledgeBaseService
  ) {
    this.llmToolService = llmToolService
    this.knowledgeBaseService = knowledgeBaseService

    // Initialize the new services
    this.llmProviderFactory = new LLMProviderFactory(settingsService, agentRegistryService)
    this.agentToolManager = new AgentToolManager(llmToolService, agentRegistryService)
    this.messagePreparationService = new MessagePreparationService(
      settingsService,
      modularPromptManager,
      agentRegistryService,
      llmToolService,
      this.agentToolManager, // Pass the agentToolManager to enable tool filtering
      this.knowledgeBaseService
    )
    this.streamingHandlerService = new StreamingHandlerService()
  }

  /**
   * Execute agent and collect structured result including both text and tool results
   * Used by OrchestrationService to preserve tool results from specialized agents
   */
  async executeAgentWithStructuredResult(
    messages: ModelMessage[],
    chatId: string,
    agentId?: string
  ): Promise<StructuredExecutionResult> {
    // Set the chat ID in the LlmToolService for permission tracking
    if (chatId) {
      this.llmToolService.setCurrentChatId(chatId)
    }

    await this.llmToolService.emitLifecycleHook('session_start', {
      chatId,
      agentId: agentId || null,
      executionMode: 'structured'
    })

    try {
      await this.llmToolService.emitLifecycleHook('before_prompt_build', {
        chatId,
        agentId: agentId || null
      })

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

      await this.llmToolService.emitLifecycleHook('before_model_resolve', {
        chatId,
        agentId: agentId || null
      })

      // Create LLM using agent-specific configuration or global settings
      const llm = await this.llmProviderFactory.createLLMFromAgentConfig(agentId)
      const llmConfig = await this.llmProviderFactory.getLLMConfig(agentId)

      // Get appropriate tools for this agent (or main orchestrator if no agent ID)
      const combinedTools = await this.agentToolManager.getToolsForAgent(agentId)

      await this.llmToolService.emitLifecycleHook('before_agent_start', {
        chatId,
        agentId: agentId || null,
        provider: llmConfig.provider,
        model: llmConfig.model
      })

      await this.llmToolService.emitLifecycleHook('llm_input', {
        chatId,
        agentId: agentId || null,
        provider: llmConfig.provider,
        model: llmConfig.model,
        messageCount: processedMessages?.length || 0
      })

      // Execute streaming with structured result
      const structuredResult = await this.streamingHandlerService.executeWithStructuredResult({
        model: llm,
        messages: processedMessages,
        system: finalSystemPrompt || '',
        tools: combinedTools,
        providerId: llmConfig.provider
      })

      await this.llmToolService.emitLifecycleHook('llm_output', {
        chatId,
        agentId: agentId || null,
        provider: llmConfig.provider,
        model: llmConfig.model,
        success: structuredResult.success,
        toolResultCount: structuredResult.toolResults.length,
        textLength: structuredResult.textResponse.length
      })

      if (chatId) {
        const latestUserPrompt = this.extractLatestUserPrompt(messages)
        void this.captureStructuredExecutionMemory(
          chatId,
          latestUserPrompt,
          structuredResult,
          agentId
        )
      }

      await this.llmToolService.emitLifecycleHook('agent_end', {
        chatId,
        agentId: agentId || null,
        success: structuredResult.success,
        executionMode: 'structured'
      })
      await this.llmToolService.emitLifecycleHook('session_end', {
        chatId,
        agentId: agentId || null,
        executionMode: 'structured',
        success: structuredResult.success
      })

      return structuredResult
    } catch (error) {
      await this.llmToolService.emitLifecycleHook('agent_end', {
        chatId,
        agentId: agentId || null,
        success: false,
        executionMode: 'structured',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      await this.llmToolService.emitLifecycleHook('session_end', {
        chatId,
        agentId: agentId || null,
        executionMode: 'structured',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
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
    const chatId = body.id

    // Set the chat ID in the LlmToolService for permission tracking
    if (chatId) {
      this.llmToolService.setCurrentChatId(chatId)
    }
    const textEncoder = new TextEncoder()

    await this.llmToolService.emitLifecycleHook('session_start', {
      chatId: chatId || null,
      agentId: agentId || null,
      executionMode: 'chunk-stream'
    })

    try {
      // Guard: only proceed if the last message is a user turn
      if (!rendererMessages || rendererMessages.length === 0) {
        await this.llmToolService.emitLifecycleHook('session_end', {
          chatId: chatId || null,
          agentId: agentId || null,
          executionMode: 'chunk-stream',
          success: true
        })
        return []
      }
      const last = rendererMessages[rendererMessages.length - 1]
      if (last.role !== 'user') {
        await this.llmToolService.emitLifecycleHook('session_end', {
          chatId: chatId || null,
          agentId: agentId || null,
          executionMode: 'chunk-stream',
          success: true
        })
        return []
      }
      if (chatId) {
        void this.captureCompletedAssistantMemories(rendererMessages, chatId, agentId)
      }

      await this.llmToolService.emitLifecycleHook('before_prompt_build', {
        chatId: chatId || null,
        agentId: agentId || null
      })

      const { processedMessages, finalSystemPrompt } =
        await this.messagePreparationService.prepareMessagesAndSystemPrompt(
          rendererMessages,
          chatId,
          agentId
        )

      if (!processedMessages || processedMessages.length === 0) {
        if (!finalSystemPrompt) {
          // Only error if there's no system prompt to guide an empty message list either
          await this.llmToolService.emitLifecycleHook('agent_end', {
            chatId: chatId || null,
            agentId: agentId || null,
            executionMode: 'chunk-stream',
            success: false,
            error: 'No messages or system prompt to send after preparation.'
          })
          await this.llmToolService.emitLifecycleHook('session_end', {
            chatId: chatId || null,
            agentId: agentId || null,
            executionMode: 'chunk-stream',
            success: false,
            error: 'No messages or system prompt to send after preparation.'
          })
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
        await this.llmToolService.emitLifecycleHook('agent_end', {
          chatId: chatId || null,
          agentId: agentId || null,
          executionMode: 'chunk-stream',
          success: false,
          error: 'Cannot process empty message list.'
        })
        await this.llmToolService.emitLifecycleHook('session_end', {
          chatId: chatId || null,
          agentId: agentId || null,
          executionMode: 'chunk-stream',
          success: false,
          error: 'Cannot process empty message list.'
        })
        return [
          textEncoder.encode(JSON.stringify({ streamError: 'Cannot process empty message list.' }))
        ]
      }

      await this.llmToolService.emitLifecycleHook('before_model_resolve', {
        chatId: chatId || null,
        agentId: agentId || null
      })

      // Create LLM using agent-specific configuration or global settings
      const llm = await this.llmProviderFactory.createLLMFromAgentConfig(agentId)
      const llmConfig = await this.llmProviderFactory.getLLMConfig(agentId)

      // Get appropriate tools for this agent (or main orchestrator if no agent ID)
      const combinedTools = await this.agentToolManager.getToolsForAgent(agentId)

      await this.llmToolService.emitLifecycleHook('before_agent_start', {
        chatId: chatId || null,
        agentId: agentId || null,
        provider: llmConfig.provider,
        model: llmConfig.model
      })
      await this.llmToolService.emitLifecycleHook('llm_input', {
        chatId: chatId || null,
        agentId: agentId || null,
        provider: llmConfig.provider,
        model: llmConfig.model,
        messageCount: processedMessages.length
      })

      // Handle streaming as chunks
      const chunks = await this.streamingHandlerService.handleStreamAsChunks({
        model: llm,
        messages: processedMessages,
        system: finalSystemPrompt || '',
        tools: combinedTools,
        providerId: llmConfig.provider,
        modelId: llmConfig.model
      })
      await this.llmToolService.emitLifecycleHook('llm_output', {
        chatId: chatId || null,
        agentId: agentId || null,
        provider: llmConfig.provider,
        model: llmConfig.model,
        chunkCount: chunks.length
      })
      await this.llmToolService.emitLifecycleHook('agent_end', {
        chatId: chatId || null,
        agentId: agentId || null,
        executionMode: 'chunk-stream',
        success: true
      })
      await this.llmToolService.emitLifecycleHook('session_end', {
        chatId: chatId || null,
        agentId: agentId || null,
        executionMode: 'chunk-stream',
        success: true
      })
      return chunks
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
      await this.llmToolService.emitLifecycleHook('agent_end', {
        chatId: chatId || null,
        agentId: agentId || null,
        executionMode: 'chunk-stream',
        success: false,
        error: errorMessage
      })
      await this.llmToolService.emitLifecycleHook('session_end', {
        chatId: chatId || null,
        agentId: agentId || null,
        executionMode: 'chunk-stream',
        success: false,
        error: errorMessage
      })
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
    const chatId = body.id

    // Set the chat ID in the LlmToolService for permission tracking
    if (chatId) {
      this.llmToolService.setCurrentChatId(chatId)
    }

    await this.llmToolService.emitLifecycleHook('session_start', {
      chatId: chatId || null,
      agentId: agentId || null,
      executionMode: 'realtime-stream'
    })

    try {
      // Guard: only proceed if the last message is a user turn
      if (!rendererMessages || rendererMessages.length === 0) {
        await this.llmToolService.emitLifecycleHook('session_end', {
          chatId: chatId || null,
          agentId: agentId || null,
          executionMode: 'realtime-stream',
          success: true
        })
        callbacks.onComplete()
        return
      }
      const last = rendererMessages[rendererMessages.length - 1]
      if (last.role !== 'user') {
        await this.llmToolService.emitLifecycleHook('session_end', {
          chatId: chatId || null,
          agentId: agentId || null,
          executionMode: 'realtime-stream',
          success: true
        })
        callbacks.onComplete()
        return
      }
      if (chatId) {
        void this.captureCompletedAssistantMemories(rendererMessages, chatId, agentId)
      }

      await this.llmToolService.emitLifecycleHook('before_prompt_build', {
        chatId: chatId || null,
        agentId: agentId || null
      })

      const { processedMessages, finalSystemPrompt } =
        await this.messagePreparationService.prepareMessagesAndSystemPrompt(
          rendererMessages,
          chatId,
          agentId
        )

      if (!processedMessages || processedMessages.length === 0) {
        if (!finalSystemPrompt) {
          await this.llmToolService.emitLifecycleHook('agent_end', {
            chatId: chatId || null,
            agentId: agentId || null,
            executionMode: 'realtime-stream',
            success: false,
            error: 'No messages or system prompt for streaming after preparation.'
          })
          await this.llmToolService.emitLifecycleHook('session_end', {
            chatId: chatId || null,
            agentId: agentId || null,
            executionMode: 'realtime-stream',
            success: false,
            error: 'No messages or system prompt for streaming after preparation.'
          })
          callbacks.onError(
            new Error('No messages or system prompt for streaming after preparation.')
          )
          callbacks.onComplete()
          return
        }
      }

      await this.llmToolService.emitLifecycleHook('before_model_resolve', {
        chatId: chatId || null,
        agentId: agentId || null
      })

      // Create LLM using agent-specific configuration or global settings
      const llm = await this.llmProviderFactory.createLLMFromAgentConfig(agentId)
      const llmConfig = await this.llmProviderFactory.getLLMConfig(agentId)

      // Get appropriate tools for this agent (or main orchestrator if no agent ID)
      const combinedTools = await this.agentToolManager.getToolsForAgent(agentId)

      await this.llmToolService.emitLifecycleHook('before_agent_start', {
        chatId: chatId || null,
        agentId: agentId || null,
        provider: llmConfig.provider,
        model: llmConfig.model
      })
      await this.llmToolService.emitLifecycleHook('llm_input', {
        chatId: chatId || null,
        agentId: agentId || null,
        provider: llmConfig.provider,
        model: llmConfig.model,
        messageCount: processedMessages.length
      })

      let streamErrored = false
      const wrappedCallbacks: StreamingCallbacks = {
        onChunk: callbacks.onChunk,
        onError: (error) => {
          streamErrored = true
          callbacks.onError(error)
        },
        onComplete: callbacks.onComplete
      }

      // Handle real-time streaming
      await this.streamingHandlerService.handleRealTimeStreaming(
        {
          model: llm,
          messages: processedMessages,
          system: finalSystemPrompt || '',
          tools: combinedTools,
          providerId: llmConfig.provider,
          modelId: llmConfig.model,
          abortSignal
        },
        wrappedCallbacks
      )

      await this.llmToolService.emitLifecycleHook('llm_output', {
        chatId: chatId || null,
        agentId: agentId || null,
        provider: llmConfig.provider,
        model: llmConfig.model,
        success: !streamErrored
      })
      await this.llmToolService.emitLifecycleHook('agent_end', {
        chatId: chatId || null,
        agentId: agentId || null,
        executionMode: 'realtime-stream',
        success: !streamErrored
      })
      await this.llmToolService.emitLifecycleHook('session_end', {
        chatId: chatId || null,
        agentId: agentId || null,
        executionMode: 'realtime-stream',
        success: !streamErrored
      })
    } catch (error) {
      await this.llmToolService.emitLifecycleHook('agent_end', {
        chatId: chatId || null,
        agentId: agentId || null,
        executionMode: 'realtime-stream',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      await this.llmToolService.emitLifecycleHook('session_end', {
        chatId: chatId || null,
        agentId: agentId || null,
        executionMode: 'realtime-stream',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      callbacks.onError(
        error instanceof Error ? error : new Error('Unknown error in streaming handler')
      )
      callbacks.onComplete()
    }
  }

  private extractLatestUserPrompt(messages: ModelMessage[]): string {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i] as unknown
      const messageRecord = asRecord(message)
      if (!messageRecord || messageRecord.role !== 'user') {
        continue
      }

      const text = extractMessageText(message)
      if (text.trim().length > 0) {
        return text.trim()
      }
    }

    return ''
  }

  private async captureStructuredExecutionMemory(
    chatId: string,
    userPrompt: string,
    result: StructuredExecutionResult,
    agentId?: string
  ): Promise<void> {
    if (!this.knowledgeBaseService || !result.success) {
      return
    }

    try {
      const executionStamp = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`
      const assistantText = result.textResponse?.trim() || ''
      const sessionSummary = this.buildSessionSummary(userPrompt, assistantText)

      if (sessionSummary) {
        await this.knowledgeBaseService.upsertWorkspaceMemoryEntry({
          chatId,
          scope: 'global',
          sourceKey: `${chatId}:structured:${executionStamp}:session`,
          memoryType: 'session_outcome',
          agentId,
          summary: sessionSummary,
          details: {
            source: 'structured-execution',
            userPrompt: truncateText(userPrompt, 500),
            assistantResponse: truncateText(assistantText, 1200)
          }
        })
      }

      for (const [index, toolResult] of result.toolResults.entries()) {
        const toolSummary = this.buildToolOutcomeSummary({
          toolName: toolResult.toolName,
          toolCallId: toolResult.toolCallId,
          args: toolResult.args,
          result: toolResult.result
        })

        await this.knowledgeBaseService.upsertWorkspaceMemoryEntry({
          chatId,
          scope: 'global',
          sourceKey: `${chatId}:structured:${executionStamp}:tool:${index}:${toolResult.toolCallId || toolResult.toolName}`,
          memoryType: 'tool_outcome',
          agentId,
          toolName: toolResult.toolName,
          summary: toolSummary,
          details: {
            source: 'structured-execution',
            toolCallId: toolResult.toolCallId,
            args: toolResult.args,
            result: toolResult.result
          }
        })
      }
    } catch {
      void 0
    }
  }

  private async captureCompletedAssistantMemories(
    rendererMessages: ModelMessage[],
    chatId: string,
    agentId?: string
  ): Promise<void> {
    if (!this.knowledgeBaseService) {
      return
    }

    try {
      const assistantMessages = rendererMessages
        .map((message, index) => ({ message, index }))
        .filter(({ message }) => {
          const messageRecord = asRecord(message)
          return messageRecord?.role === 'assistant'
        })
        .slice(-2)

      for (const { message, index } of assistantMessages) {
        const messageRecord = asRecord(message)
        if (!messageRecord) {
          continue
        }

        const sourceMessageId =
          typeof messageRecord.id === 'string' ? messageRecord.id : `assistant-${index}`
        const messageText = extractMessageText(messageRecord).trim()
        const toolOutcomes = extractToolOutcomes(messageRecord)

        if (messageText) {
          const summary = this.buildSessionSummary('', messageText)
          if (summary) {
            await this.knowledgeBaseService.upsertWorkspaceMemoryEntry({
              chatId,
              scope: 'global',
              sourceKey: `${chatId}:history:${sourceMessageId}:session`,
              sourceMessageId,
              memoryType: 'session_outcome',
              agentId,
              summary,
              details: {
                source: 'renderer-history',
                assistantResponse: truncateText(messageText, 1200)
              }
            })
          }
        }

        for (const [toolIndex, toolOutcome] of toolOutcomes.entries()) {
          let toolHashInput = `${toolOutcome.toolName || 'tool'}:${toolOutcome.toolCallId || toolIndex}`
          try {
            toolHashInput = JSON.stringify({
              toolName: toolOutcome.toolName,
              toolCallId: toolOutcome.toolCallId,
              result: toolOutcome.result,
              error: toolOutcome.error
            })
          } catch {
            void 0
          }
          const summary = this.buildToolOutcomeSummary(toolOutcome)

          await this.knowledgeBaseService.upsertWorkspaceMemoryEntry({
            chatId,
            scope: 'global',
            sourceKey: `${chatId}:history:${sourceMessageId}:tool:${toolIndex}:${createContentHash(toolHashInput)}`,
            sourceMessageId,
            memoryType: 'tool_outcome',
            agentId,
            toolName: toolOutcome.toolName,
            summary,
            details: {
              source: 'renderer-history',
              toolCallId: toolOutcome.toolCallId,
              args: toolOutcome.args,
              result: toolOutcome.result,
              error: toolOutcome.error
            }
          })
        }
      }
    } catch {
      void 0
    }
  }

  private buildSessionSummary(userPrompt: string, assistantText: string): string {
    const normalizedPrompt = userPrompt.trim()
    const normalizedAssistant = assistantText.trim()

    if (!normalizedPrompt && !normalizedAssistant) {
      return ''
    }

    if (!normalizedPrompt) {
      return `Assistant outcome: ${truncateText(normalizedAssistant, 320)}`
    }

    if (!normalizedAssistant) {
      return `User request: ${truncateText(normalizedPrompt, 220)}`
    }

    return `Request "${truncateText(normalizedPrompt, 140)}" outcome: ${truncateText(
      normalizedAssistant,
      260
    )}`
  }

  private buildToolOutcomeSummary(toolOutcome: ToolOutcomeCapture): string {
    const toolName = toolOutcome.toolName || 'unknown_tool'
    if (toolOutcome.error) {
      return `Tool ${toolName} failed: ${truncateText(toolOutcome.error, 220)}`
    }

    if (typeof toolOutcome.result === 'string') {
      return `Tool ${toolName} result: ${truncateText(toolOutcome.result, 220)}`
    }

    if (toolOutcome.result && typeof toolOutcome.result === 'object') {
      const resultRecord = asRecord(toolOutcome.result)
      if (resultRecord && typeof resultRecord.message === 'string') {
        return `Tool ${toolName} result: ${truncateText(resultRecord.message, 220)}`
      }
      return `Tool ${toolName} completed with structured output.`
    }

    return `Tool ${toolName} completed.`
  }

  /**
   * Get LLM configuration for debugging/diagnostics
   * @param agentId Optional agent ID
   * @returns LLM provider configuration
   */
  async getLLMConfig(agentId?: string): Promise<LLMProviderConfig> {
    return await this.llmProviderFactory.getLLMConfig(agentId)
  }

  /**
   * Get tools for an agent for debugging/diagnostics
   * @param agentId Optional agent ID
   * @returns Tools available for the agent
   */
  async getAvailableTools(agentId?: string): Promise<Record<string, unknown>> {
    return await this.agentToolManager.getToolsForAgent(agentId)
  }

  /**
   * Validate messages before processing
   * @param messages Messages to validate
   * @returns true if valid, false otherwise
   */
  validateMessages(messages: ModelMessage[]): boolean {
    return this.messagePreparationService.validateMessages(messages)
  }
}
