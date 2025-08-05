import { type IpcMain } from 'electron'
import { IpcChannels } from '../../shared/ipc-types' // Adjusted path
import { dbService, type Chat, type Message } from '../services/db-service'
// import { KnowledgeBaseService } from '../services/knowledge-base.service' // No longer needed here

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
        const chat = dbService.createChat(chatData)
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
      const chat = dbService.getChatById(id)
      return { success: true, data: chat } // chat can be null if not found, which is a valid success case
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(
    IpcChannels.dbGetAllChats,
    async (_event, orderBy?: 'created_at' | 'updated_at', order?: 'ASC' | 'DESC') => {
      try {
        const chats = dbService.getAllChats(orderBy, order)
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
        const chat = dbService.updateChat(id, updates)
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
      const deleted = dbService.deleteChat(id)
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
        const message = dbService.addMessage(messageData)
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
      const message = dbService.getMessageById(id)
      return { success: true, data: message }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(
    IpcChannels.dbGetMessagesByChatId,
    async (_event, chat_id: string, orderBy?: 'created_at', order?: 'ASC' | 'DESC') => {
      try {
        const messages = dbService.getMessagesByChatId(chat_id, orderBy, order)
        return { success: true, data: messages }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(IpcChannels.dbDeleteMessage, async (_event, id: string) => {
    try {
      const deleted = dbService.deleteMessage(id)
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
