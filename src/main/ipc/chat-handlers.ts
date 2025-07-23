import { type IpcMain } from 'electron'
import { type ChatService } from '../services/chat-service'
import { dbService } from '../services/db-service' // Import dbService for chat existence check

export function registerChatIpcHandlers(ipcMain: IpcMain, chatService: ChatService): void {
  ipcMain.handle('ctg:chat:sendMessageStreamHandler', async (_event, jsonBodyString) => {
    let parsedBody
    try {
      parsedBody = JSON.parse(jsonBodyString)
      console.log('[Chat Handlers IPC] Parsed body:', JSON.stringify(parsedBody, null, 2))
    } catch (e) {
      console.error('[Chat Handlers IPC] Failed to parse JSON body from renderer:', e)
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
          console.warn(
            `[Chat Handlers IPC] dbService.createChat returned null for ID ${chatId}. Attempting to fetch it again.`
          )
          chat = dbService.getChatById(chatId)

          if (!chat) {
            console.error(
              `[Chat Handlers IPC] CRITICAL FAILURE: Could not find or create chat with ID ${chatId}. Messages might not be saved correctly by renderer later.`
            )
          }
        }
      }
    } else {
      console.warn(
        '[Chat Handlers IPC] Could not ensure chat exists: parsedBody.id or parsedBody.messages is missing.'
      )
    }
    // --- END FIX ---

    if (!chatService) {
      console.error('[Chat Handlers IPC] ChatService not initialized (passed as null)!')
      const textEncoder = new TextEncoder()
      return [textEncoder.encode(JSON.stringify({ streamError: 'ChatService not available.' }))]
    }
    try {
      return await chatService.handleSendMessageStream(parsedBody)
    } catch (error) {
      console.error(
        '[Chat Handlers IPC] Error in ctg:chat:sendMessageStreamHandler (after service call):',
        error
      )
      const textEncoder = new TextEncoder()
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error in chat stream handler'
      return [textEncoder.encode(JSON.stringify({ streamError: errorMessage }))]
    }
  })

  // NEW HANDLER: Supports real-time streaming via event emitter pattern
  ipcMain.handle('ctg:chat:startMessageStream', async (event, streamId, jsonBodyString) => {
    let parsedBody
    try {
      parsedBody = JSON.parse(jsonBodyString)
      console.log('[Chat Handlers IPC] Parsed body:', JSON.stringify(parsedBody, null, 2))
    } catch (e) {
      console.error('[Chat Handlers IPC] Failed to parse JSON body from renderer:', e)
      event.sender.send(
        `ctg:chat:stream:error:${streamId}`,
        'Invalid request format from renderer.'
      )
      return false
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
          console.warn(
            `[Chat Handlers IPC] dbService.createChat returned null for ID ${chatId}. Stream may fail.`
          )
        }
      }
    }

    if (!chatService) {
      console.error('[Chat Handlers IPC] ChatService not initialized for streaming!')
      event.sender.send(`ctg:chat:stream:error:${streamId}`, 'ChatService not available.')
      return false
    }

    try {
      // Send start notification
      event.sender.send(`ctg:chat:stream:start:${streamId}`)

      // Process stream in real-time, sending chunks to the renderer
      await chatService.handleStreamingMessage(parsedBody, {
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
      console.error('[Chat Handlers IPC] Error in streaming handler:', error)
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error in chat stream handler'
      event.sender.send(`ctg:chat:stream:error:${streamId}`, errorMessage)
      event.sender.send(`ctg:chat:stream:end:${streamId}`)
      return false
    }
  })

  console.log('[Main Process] ChatService IPC handler registered by chat.handlers.ts.')
}
