import { type IpcMain } from 'electron'
import { type ChatService } from '../services/chat-service'
import { dbService } from '../services/db-service' // Import dbService for chat existence check
import { AgentRoutingService } from '../services/agent-routing-service'
import { MentionService, type MessageContent } from '../services/mention-service'
import { ProductionDataSourceResolver } from '../services/data-source-resolver'
import type { KnowledgeBaseService } from '../services/knowledge-base-service'

// Initialize mention processing services
const mentionService = MentionService.getInstance()
// Will be initialized with real services in the registration function
let dataSourceResolver: ProductionDataSourceResolver

// Registry for active streams and their abort controllers
const activeStreams = new Map<string, AbortController>()

const streamTextEncoder = new TextEncoder()

type RendererTextPart = { type: 'text'; text: string }
type RendererMessageLike = { role: string; content: unknown; parts?: unknown[] }

function isTextPart(part: unknown): part is RendererTextPart {
  if (!part || typeof part !== 'object') return false
  const candidate = part as { type?: unknown; text?: unknown }
  return candidate.type === 'text' && typeof candidate.text === 'string'
}

function encodeUiMessageChunk(chunk: Record<string, unknown>): Uint8Array {
  return streamTextEncoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
}

function buildUiTextChunks(text: string): Uint8Array[] {
  const chunks: Uint8Array[] = []
  chunks.push(encodeUiMessageChunk({ type: 'start' }))
  chunks.push(encodeUiMessageChunk({ type: 'text-start', id: 'text-1' }))
  if (text) {
    chunks.push(encodeUiMessageChunk({ type: 'text-delta', id: 'text-1', delta: text }))
  }
  chunks.push(encodeUiMessageChunk({ type: 'text-end', id: 'text-1' }))
  chunks.push(encodeUiMessageChunk({ type: 'finish', finishReason: 'stop' }))
  return chunks
}

function extractMessageText(message: RendererMessageLike | undefined): string {
  if (!message) return ''
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) {
    return message.content
      .filter(isTextPart)
      .map((part) => part.text)
      .join('')
  }
  if (Array.isArray(message.parts)) {
    return message.parts
      .filter(isTextPart)
      .map((part) => part.text)
      .join('')
  }
  return ''
}

/**
 * Process mentions in message content if they exist
 */
async function processMentions(messages: RendererMessageLike[]): Promise<void> {
  if (!messages || messages.length === 0) {
    return
  }

  // Find the last user message
  const lastUserMessage = messages.filter((m) => m.role === 'user').pop()
  if (!lastUserMessage) {
    return
  }

  const lastUserMessageText = extractMessageText(lastUserMessage)
  if (!lastUserMessageText) {
    return
  }

  // Check if message has mentions
  if (!mentionService.hasMentions(lastUserMessageText)) {
    return
  }

  try {
    // Enhance the message with mention metadata
    const enhanced = await mentionService.enhanceMessage(
      {
        role: lastUserMessage.role,
        content: lastUserMessageText,
        parts: lastUserMessage.parts
      } as MessageContent,
      dataSourceResolver
    )

    // Update the message in place
    lastUserMessage.content = enhanced.content
    if (enhanced.parts) {
      lastUserMessage.parts = enhanced.parts
    }
  } catch (error) {
    // Continue without enhancement on error
    console.warn('Failed to enhance message:', error)
  }
}

export function registerChatIpcHandlers(
  ipcMain: IpcMain,
  chatService: ChatService,
  agentRoutingService?: AgentRoutingService,
  knowledgeBaseService?: KnowledgeBaseService,
  layerDbManager?: unknown
): void {
  // Initialize production resolver with real services
  dataSourceResolver = new ProductionDataSourceResolver(knowledgeBaseService, layerDbManager)
  ipcMain.handle('ctg:chat:sendMessageStreamHandler', async (_event, jsonBodyString) => {
    let parsedBody: {
      id?: string
      messages?: RendererMessageLike[]
      model?: string
      agentId?: string
    }
    try {
      parsedBody = JSON.parse(jsonBodyString)
    } catch {
      return [
        encodeUiMessageChunk({ type: 'error', errorText: 'Invalid request format from renderer.' })
      ]
    }

    // --- BEGIN FIX: Ensure chat exists before proceeding (from previous step, now in chat.handlers.ts) ---
    if (parsedBody && parsedBody.id && parsedBody.messages) {
      const chatId = parsedBody.id as string
      let chat = dbService.getChatById(chatId)

      if (!chat) {
        let potentialTitle = 'New Chat'
        const firstUserMessage = parsedBody.messages?.find((m) => m.role === 'user')
        const firstUserMessageText = extractMessageText(firstUserMessage)
        if (firstUserMessageText.trim() !== '') {
          potentialTitle = firstUserMessageText.substring(0, 75)
        }

        chat = dbService.createChat({ id: chatId, title: potentialTitle })

        if (!chat) {
          chat = dbService.getChatById(chatId)

          if (!chat) {
            console.warn('Failed to create chat with ID:', chatId)
          }
        }
      }
    } else {
      console.warn('Invalid chat request body')
    }
    // --- END FIX ---

    // Process mentions in messages
    if (parsedBody?.messages) {
      await processMentions(parsedBody.messages)
    }

    if (!chatService) {
      return [encodeUiMessageChunk({ type: 'error', errorText: 'ChatService not available.' })]
    }
    try {
      // Check if we should use agent orchestration
      if (agentRoutingService && parsedBody?.messages && parsedBody.messages.length > 0) {
        // Get the last user message
        const lastUserMessage = parsedBody.messages?.filter((m) => m.role === 'user').pop()
        const lastUserMessageText = extractMessageText(lastUserMessage)
        if (lastUserMessage && lastUserMessageText) {
          try {
            // Extract the chat ID from the parsedBody
            const chatId = parsedBody.id as string

            // Extract the model/agent information from the request
            const activeModel = parsedBody.model || parsedBody.agentId

            // If no agent/model specified, we can't orchestrate
            if (!activeModel) {
              return await chatService.handleSendMessageStream(
                parsedBody as Parameters<ChatService['handleSendMessageStream']>[0]
              )
            }

            // The selected model/LLM itself should be the orchestrator
            const orchestratorAgentId = activeModel

            // Call the agent routing service's orchestration method
            const orchestrationPrompt =
              lastUserMessageText ||
              (typeof lastUserMessage.content === 'string'
                ? lastUserMessage.content
                : JSON.stringify(lastUserMessage.content))

            const result = await agentRoutingService.orchestrateTask(
              orchestrationPrompt,
              chatId,
              orchestratorAgentId
            )

            // If orchestration was successful, return the result directly
            if (result.success) {
              return buildUiTextChunks(result.finalResponse)
            }
          } catch {
            // Fall back to regular processing if orchestration fails
          }
        }
      }

      // Regular processing if orchestration is not used or fails
      return await chatService.handleSendMessageStream(
        parsedBody as Parameters<ChatService['handleSendMessageStream']>[0]
      )
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error in chat stream handler'
      return [encodeUiMessageChunk({ type: 'error', errorText: errorMessage })]
    }
  })

  // NEW HANDLER: Supports real-time streaming via event emitter pattern
  ipcMain.handle('ctg:chat:startMessageStream', async (event, streamId, jsonBodyString) => {
    let parsedBody: {
      id?: string
      messages?: RendererMessageLike[]
      model?: string
      agentId?: string
    }
    try {
      parsedBody = JSON.parse(jsonBodyString)
    } catch {
      event.sender.send(
        `ctg:chat:stream:error:${streamId}`,
        'Invalid request format from renderer.'
      )
      return false
    }

    // Process mentions in messages
    if (parsedBody?.messages) {
      await processMentions(parsedBody.messages)
    }

    // Ensure chat exists (similar to sendMessageStreamHandler)
    if (parsedBody && parsedBody.id && parsedBody.messages) {
      const chatId = parsedBody.id as string
      let chat = dbService.getChatById(chatId)

      if (!chat) {
        let potentialTitle = 'New Chat'
        const firstUserMessage = parsedBody.messages?.find((m) => m.role === 'user')
        const firstUserMessageText = extractMessageText(firstUserMessage)
        if (firstUserMessageText.trim() !== '') {
          potentialTitle = firstUserMessageText.substring(0, 75)
        }

        chat = dbService.createChat({ id: chatId, title: potentialTitle })

        if (!chat) {
          console.warn('Failed to create stream chat with ID:', chatId)
        }
      }
    }

    if (!chatService) {
      event.sender.send(`ctg:chat:stream:error:${streamId}`, 'ChatService not available.')
      return false
    }

    try {
      // Create an abort controller for this stream
      const abortController = new AbortController()
      activeStreams.set(streamId, abortController)

      // Send start notification
      event.sender.send(`ctg:chat:stream:start:${streamId}`)

      // Check if we can use orchestration for this message too
      if (agentRoutingService && parsedBody?.messages && parsedBody.messages.length > 0) {
        const lastUserMessage = parsedBody.messages?.filter((m) => m.role === 'user').pop()
        const lastUserMessageText = extractMessageText(lastUserMessage)
        if (lastUserMessage && lastUserMessageText) {
          try {
            const chatId = parsedBody.id as string
            const activeModel = parsedBody.model || parsedBody.agentId

            if (activeModel) {
              // The selected model/LLM itself should be the orchestrator
              const orchestratorAgentId = activeModel

              try {
                // Call the orchestration method
                const orchestrationPrompt =
                  lastUserMessageText ||
                  (typeof lastUserMessage.content === 'string'
                    ? lastUserMessage.content
                    : JSON.stringify(lastUserMessage.content))

                const result = await agentRoutingService.orchestrateTask(
                  orchestrationPrompt,
                  chatId,
                  orchestratorAgentId
                )

                if (result.success) {
                  const orchestrationChunks = buildUiTextChunks(result.finalResponse)
                  orchestrationChunks.forEach((chunk) => {
                    event.sender.send(`ctg:chat:stream:chunk:${streamId}`, chunk)
                  })
                  event.sender.send(`ctg:chat:stream:end:${streamId}`)
                  return true
                }
              } catch {
                // Fall through to regular processing
              }
            }
          } catch {
            // Fall through to regular processing
          }
        }
      }

      // Process stream in real-time, sending chunks to the renderer if orchestration wasn't used
      await chatService.handleStreamingMessage(
        parsedBody as Parameters<ChatService['handleStreamingMessage']>[0],
        {
          onChunk: (chunk: Uint8Array) => {
            event.sender.send(`ctg:chat:stream:chunk:${streamId}`, chunk)
          },
          onError: (error: Error) => {
            event.sender.send(`ctg:chat:stream:error:${streamId}`, error.message)
            // Clean up abort controller on error
            activeStreams.delete(streamId)
          },
          onComplete: () => {
            event.sender.send(`ctg:chat:stream:end:${streamId}`)
            // Clean up abort controller on completion
            activeStreams.delete(streamId)
          }
        },
        abortController.signal
      )

      return true
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error in chat stream handler'
      event.sender.send(`ctg:chat:stream:error:${streamId}`, errorMessage)
      event.sender.send(`ctg:chat:stream:end:${streamId}`)
      // Clean up abort controller on exception
      activeStreams.delete(streamId)
      return false
    }
  })

  // Add handler for canceling streams
  ipcMain.handle('ctg:chat:cancelStream', async (_event, streamId: string) => {
    const abortController = activeStreams.get(streamId)
    if (abortController) {
      abortController.abort()
      activeStreams.delete(streamId)
      return true
    }
    return false
  })

  // Add new handler for orchestrated chat messages
  if (agentRoutingService) {
    ipcMain.handle(
      'chat:orchestrateMessage',
      async (_event, { chatId, message, orchestratorAgentId }) => {
        try {
          // Directly use the selected agent/model as the orchestrator
          const result = await agentRoutingService.orchestrateTask(
            message,
            chatId,
            orchestratorAgentId
          )

          return result
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error in orchestration'
          }
        }
      }
    )

    // Add handler for getting agent capabilities
    ipcMain.handle('agents:getCapabilities', async () => {
      try {
        return await agentRoutingService.getAgentCapabilities()
      } catch (error) {
        return {
          success: false,
          capabilities: [],
          error: error instanceof Error ? error.message : 'Unknown error getting capabilities'
        }
      }
    })

    // Add handler for getting orchestration status
    ipcMain.handle('orchestration:getStatus', async (_event, sessionId) => {
      try {
        return await agentRoutingService.getOrchestrationStatus(sessionId)
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error getting status'
        }
      }
    })
  }
}
