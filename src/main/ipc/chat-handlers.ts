import { type IpcMain } from 'electron'
import { type ChatService } from '../services/chat-service'
import { dbService } from '../services/db-service' // Import dbService for chat existence check
import { AgentRoutingService } from '../services/agent-routing-service'
import { MentionService, type MessageContent } from '../services/mention-service'
import { ProductionDataSourceResolver } from '../services/data-source-resolver'

// Initialize mention processing services
const mentionService = MentionService.getInstance()
// Will be initialized with real services in the registration function
let dataSourceResolver: ProductionDataSourceResolver

/**
 * Process mentions in message content if they exist
 */
async function processMentions(messages: Array<{ role: string; content: any; parts?: any[] }>): Promise<void> {
  if (!messages || messages.length === 0) {
    return
  }

  // Find the last user message
  const lastUserMessage = messages
    .filter((m) => m.role === 'user')
    .pop()

  if (!lastUserMessage?.content || typeof lastUserMessage.content !== 'string') {
    return
  }

  // Check if message has mentions
  if (!mentionService.hasMentions(lastUserMessage.content)) {
    return
  }

  try {
    // Enhance the message with mention metadata
    const enhanced = await mentionService.enhanceMessage(
      lastUserMessage as MessageContent,
      dataSourceResolver
    )

    // Update the message in place
    lastUserMessage.content = enhanced.content
    if (enhanced.parts) {
      lastUserMessage.parts = enhanced.parts
    }
  } catch (error) {
    console.error('Error processing mentions:', error)
    // Continue without enhancement on error
  }
}

export function registerChatIpcHandlers(
  ipcMain: IpcMain,
  chatService: ChatService,
  agentRoutingService?: AgentRoutingService,
  knowledgeBaseService?: any,
  layerDbManager?: any
): void {
  // Initialize production resolver with real services
  dataSourceResolver = new ProductionDataSourceResolver(knowledgeBaseService, layerDbManager)
  ipcMain.handle('ctg:chat:sendMessageStreamHandler', async (_event, jsonBodyString) => {
    let parsedBody: {
      id?: string
      messages?: Array<{ role: string; content: string | any }>
      model?: string
      agentId?: string
    }
    try {
      parsedBody = JSON.parse(jsonBodyString)
    } catch (e) {
      const textEncoder = new TextEncoder()
      return [
        textEncoder.encode(JSON.stringify({ streamError: 'Invalid request format from renderer.' }))
      ]
    }

    // --- BEGIN FIX: Ensure chat exists before proceeding (from previous step, now in chat.handlers.ts) ---
    if (parsedBody && parsedBody.id && parsedBody.messages) {
      const chatId = parsedBody.id as string
      let chat = dbService.getChatById(chatId)

      if (!chat) {
        let potentialTitle = 'New Chat'
        const firstUserMessageContent = parsedBody.messages?.find((m) => m.role === 'user')?.content
        if (typeof firstUserMessageContent === 'string' && firstUserMessageContent.trim() !== '') {
          potentialTitle = firstUserMessageContent.substring(0, 75)
        } else if (
          Array.isArray(firstUserMessageContent) &&
          firstUserMessageContent.length > 0 &&
          typeof firstUserMessageContent[0].text === 'string'
        ) {
          potentialTitle = firstUserMessageContent[0].text.substring(0, 75)
        }

        chat = dbService.createChat({ id: chatId, title: potentialTitle })

        if (!chat) {
          chat = dbService.getChatById(chatId)

          if (!chat) {
          }
        }
      }
    } else {
    }
    // --- END FIX ---

    // Process mentions in messages
    if (parsedBody?.messages) {
      await processMentions(parsedBody.messages)
    }

    if (!chatService) {
      const textEncoder = new TextEncoder()
      return [textEncoder.encode(JSON.stringify({ streamError: 'ChatService not available.' }))]
    }
    try {
      // Check if we should use agent orchestration
      if (agentRoutingService && parsedBody?.messages && parsedBody.messages.length > 0) {
        // Get the last user message
        const lastUserMessage = parsedBody.messages
          ?.filter((m: { role: string; content: any }) => m.role === 'user')
          .pop()
        if (lastUserMessage?.content) {
          try {
            // Extract the chat ID from the parsedBody
            const chatId = parsedBody.id as string

            // Extract the model/agent information from the request
            const activeModel = parsedBody.model || parsedBody.agentId

            // If no agent/model specified, we can't orchestrate
            if (!activeModel) {
              return await chatService.handleSendMessageStream(parsedBody as any)
            }

            // The selected model/LLM itself should be the orchestrator
            const orchestratorAgentId = activeModel

            // Call the agent routing service's orchestration method
            const result = await agentRoutingService.orchestrateTask(
              typeof lastUserMessage.content === 'string'
                ? lastUserMessage.content
                : JSON.stringify(lastUserMessage.content),
              chatId,
              orchestratorAgentId
            )

            // If orchestration was successful, return the result directly
            if (result.success) {
              // Format the response as a stream chunk
              const textEncoder = new TextEncoder()
              return [
                textEncoder.encode(
                  JSON.stringify({
                    id: parsedBody.id,
                    role: 'assistant',
                    content: result.finalResponse,
                    // Include orchestration metadata
                    orchestration: {
                      subtasks: result.subtasks,
                      agentsInvolved: result.agentsInvolved,
                      completionTime: result.completionTime
                    }
                  })
                )
              ]
            }
          } catch (orchestrationError) {
            // Fall back to regular processing if orchestration fails
          }
        }
      }

      // Regular processing if orchestration is not used or fails
      return await chatService.handleSendMessageStream(parsedBody as any)
    } catch (error) {
      const textEncoder = new TextEncoder()
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error in chat stream handler'
      return [textEncoder.encode(JSON.stringify({ streamError: errorMessage }))]
    }
  })

  // NEW HANDLER: Supports real-time streaming via event emitter pattern
  ipcMain.handle('ctg:chat:startMessageStream', async (event, streamId, jsonBodyString) => {
    let parsedBody: {
      id?: string
      messages?: Array<{ role: string; content: string | any }>
      model?: string
      agentId?: string
    }
    try {
      parsedBody = JSON.parse(jsonBodyString)
    } catch (e) {
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
        const firstUserMessageContent = parsedBody.messages?.find((m) => m.role === 'user')?.content
        if (typeof firstUserMessageContent === 'string' && firstUserMessageContent.trim() !== '') {
          potentialTitle = firstUserMessageContent.substring(0, 75)
        } else if (
          Array.isArray(firstUserMessageContent) &&
          firstUserMessageContent.length > 0 &&
          typeof firstUserMessageContent[0].text === 'string'
        ) {
          potentialTitle = firstUserMessageContent[0].text.substring(0, 75)
        }

        chat = dbService.createChat({ id: chatId, title: potentialTitle })

        if (!chat) {
        }
      }
    }

    if (!chatService) {
      event.sender.send(`ctg:chat:stream:error:${streamId}`, 'ChatService not available.')
      return false
    }

    try {
      // Send start notification
      event.sender.send(`ctg:chat:stream:start:${streamId}`)

      // Check if we can use orchestration for this message too
      if (agentRoutingService && parsedBody?.messages && parsedBody.messages.length > 0) {
        const lastUserMessage = parsedBody.messages
          ?.filter((m: { role: string; content: any }) => m.role === 'user')
          .pop()
        if (lastUserMessage?.content) {
          try {
            const chatId = parsedBody.id as string
            const activeModel = parsedBody.model || parsedBody.agentId

            if (activeModel) {
              // The selected model/LLM itself should be the orchestrator
              const orchestratorAgentId = activeModel

              try {
                // Call the orchestration method
                const result = await agentRoutingService.orchestrateTask(
                  typeof lastUserMessage.content === 'string'
                    ? lastUserMessage.content
                    : JSON.stringify(lastUserMessage.content),
                  chatId,
                  orchestratorAgentId
                )

                if (result.success) {
                  // For streaming, we'll send the orchestration result as a single chunk
                  const textEncoder = new TextEncoder()
                  const orchestrationResult = textEncoder.encode(
                    JSON.stringify({
                      id: parsedBody.id,
                      role: 'assistant',
                      content: result.finalResponse,
                      orchestration: {
                        subtasks: result.subtasks,
                        agentsInvolved: result.agentsInvolved,
                        completionTime: result.completionTime
                      }
                    })
                  )

                  // Send the result as a single chunk
                  event.sender.send(`ctg:chat:stream:chunk:${streamId}`, orchestrationResult)
                  event.sender.send(`ctg:chat:stream:end:${streamId}`)
                  return true
                }
              } catch (orchestrationError) {
                // Fall through to regular processing
              }
            }
          } catch (error) {
            // Fall through to regular processing
          }
        }
      }

      // Process stream in real-time, sending chunks to the renderer if orchestration wasn't used
      await chatService.handleStreamingMessage(parsedBody as any, {
        onChunk: (chunk: Uint8Array) => {
          event.sender.send(`ctg:chat:stream:chunk:${streamId}`, chunk)
        },
        onError: (error: Error) => {
          event.sender.send(`ctg:chat:stream:error:${streamId}`, error.message)
        },
        onComplete: () => {
          event.sender.send(`ctg:chat:stream:end:${streamId}`)
        }
      })

      return true
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error in chat stream handler'
      event.sender.send(`ctg:chat:stream:error:${streamId}`, errorMessage)
      event.sender.send(`ctg:chat:stream:end:${streamId}`)
      return false
    }
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
