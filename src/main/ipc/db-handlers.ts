import { type IpcMain } from 'electron'
import { IpcChannels } from '../../shared/ipc-types' // Adjusted path
import { dbService, type Chat, type Message } from '../services/db-service'
import { z } from 'zod'
// import { KnowledgeBaseService } from '../services/knowledge-base.service' // No longer needed here

const idSchema = z.string().trim().min(1).max(256)
const orderBySchema = z.enum(['created_at', 'updated_at']).optional()
const orderSchema = z.enum(['ASC', 'DESC']).optional()
const messageOrderBySchema = z.enum(['created_at']).optional()
const chatRoleSchema = z.enum(['system', 'user', 'assistant', 'function', 'data', 'tool'])

const createChatSchema = z
  .object({
    id: idSchema,
    title: z.string().max(1000).nullable().optional(),
    metadata: z.string().max(200_000).nullable().optional()
  })
  .strict()

const updateChatSchema = z
  .object({
    title: z.string().max(1000).nullable().optional(),
    metadata: z.string().max(200_000).nullable().optional()
  })
  .strict()

const addMessageSchema = z
  .object({
    id: idSchema,
    chat_id: idSchema,
    role: chatRoleSchema,
    content: z.string().max(1_000_000),
    name: z.string().max(256).nullable().optional(),
    tool_calls: z.string().max(2_000_000).nullable().optional(),
    tool_call_id: z.string().max(256).nullable().optional(),
    orchestration: z.string().max(2_000_000).nullable().optional()
  })
  .strict()

export function registerDbIpcHandlers(
  ipcMain: IpcMain
  // knowledgeBaseService: KnowledgeBaseService // Removed parameter
): void {
  ipcMain.handle(
    IpcChannels.dbCreateChat,
    async (
      _event,
      chatData: Pick<Chat, 'id'> & Partial<Omit<Chat, 'id' | 'created_at' | 'updated_at'>>
    ) => {
      try {
        const parsedChatData = createChatSchema.parse(chatData)
        const chat = dbService.createChat(parsedChatData)
        if (chat) {
          return { success: true, data: chat }
        } else {
          return { success: false, error: 'Failed to create chat in DBService.' }
        }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(IpcChannels.dbGetChatById, async (_event, id: string) => {
    try {
      const parsedId = idSchema.parse(id)
      const chat = dbService.getChatById(parsedId)
      return { success: true, data: chat } // chat can be null if not found, which is a valid success case
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(
    IpcChannels.dbGetAllChats,
    async (_event, orderBy?: 'created_at' | 'updated_at', order?: 'ASC' | 'DESC') => {
      try {
        const parsedOrderBy = orderBySchema.parse(orderBy)
        const parsedOrder = orderSchema.parse(order)
        const chats = dbService.getAllChats(parsedOrderBy, parsedOrder)
        return { success: true, data: chats }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(
    IpcChannels.dbUpdateChat,
    async (
      _event,
      id: string,
      updates: Partial<Omit<Chat, 'id' | 'created_at' | 'updated_at'>>
    ) => {
      try {
        const parsedId = idSchema.parse(id)
        const parsedUpdates = updateChatSchema.parse(updates)
        const chat = dbService.updateChat(parsedId, parsedUpdates)
        if (chat) {
          return { success: true, data: chat }
        }
        return {
          success: false,
          error: `Failed to update chat with id ${id}. It might not exist or an error occurred.`
        }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(IpcChannels.dbDeleteChat, async (_event, id: string) => {
    try {
      const parsedId = idSchema.parse(id)
      const deleted = dbService.deleteChat(parsedId)
      return { success: deleted }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(
    IpcChannels.dbAddMessage,
    async (
      _event,
      messageData: Pick<Message, 'id' | 'chat_id' | 'role' | 'content'> &
        Partial<Omit<Message, 'id' | 'chat_id' | 'role' | 'content' | 'created_at'>>
    ) => {
      try {
        const parsedMessage = addMessageSchema.parse(messageData)
        const message = dbService.addMessage(parsedMessage)
        if (message) {
          return { success: true, data: message }
        }
        return { success: false, error: 'Failed to add message in DBService.' }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(IpcChannels.dbGetMessageById, async (_event, id: string) => {
    try {
      const parsedId = idSchema.parse(id)
      const message = dbService.getMessageById(parsedId)
      return { success: true, data: message }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(
    IpcChannels.dbGetMessagesByChatId,
    async (_event, chat_id: string, orderBy?: 'created_at', order?: 'ASC' | 'DESC') => {
      try {
        const parsedChatId = idSchema.parse(chat_id)
        const parsedOrderBy = messageOrderBySchema.parse(orderBy)
        const parsedOrder = orderSchema.parse(order)
        const messages = dbService.getMessagesByChatId(parsedChatId, parsedOrderBy, parsedOrder)
        return { success: true, data: messages }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(IpcChannels.dbDeleteMessage, async (_event, id: string) => {
    try {
      const parsedId = idSchema.parse(id)
      const deleted = dbService.deleteMessage(parsedId)
      return { success: deleted }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // --- Knowledge Base Document Handlers --- // Removed these handlers
  // ipcMain.handle(IpcChannels.dbGetAllKnowledgeBaseDocuments, async (_event) => { ... })
  // ipcMain.handle(IpcChannels.dbDeleteKnowledgeBaseDocument, async (_event, id: string) => { ... })
  // Add other handlers for KB documents as needed
}
