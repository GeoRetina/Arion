import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Chat, Message } from '../../../shared/ipc-types'

// Assuming window.ctg.db is exposed by the preload script
const dbApi = window.ctg?.db

export type { Chat, Message } // Re-exporting Chat and Message types

export interface ChatHistoryState {
  chats: Chat[]
  currentChatId: string | null
  currentMessages: Message[]
  isLoadingChats: boolean
  isLoadingMessages: boolean
  error: string | null
}

export interface ChatHistoryActions {
  fetchChats: () => Promise<void>
  loadChat: (chatId: string) => Promise<void>
  createChatAndSelect: (
    chatData: Pick<Chat, 'id'> & Partial<Omit<Chat, 'id' | 'created_at' | 'updated_at'>>
  ) => Promise<string | null>
  addMessageToCurrentChat: (
    messageData: Pick<Message, 'id' | 'chat_id' | 'role' | 'content'> &
      Partial<Omit<Message, 'id' | 'chat_id' | 'role' | 'content' | 'created_at'>>
  ) => Promise<void>
  deleteChatAndUpdateList: (chatId: string) => Promise<void>
  updateChatTitleInList: (chatId: string, title: string) => Promise<void>
  clearCurrentChat: () => void
  setError: (error: string | null) => void
}

export const useChatHistoryStore = create<ChatHistoryState & ChatHistoryActions>()(
  immer((set, get) => ({
    chats: [],
    currentChatId: null,
    currentMessages: [],
    isLoadingChats: false,
    isLoadingMessages: false,
    error: null,

    fetchChats: async () => {
      console.log('[ChatHistoryStore] fetchChats called')
      if (!dbApi) {
        set({ error: 'DB API not available.', isLoadingChats: false })
        console.error('[ChatHistoryStore] fetchChats - DB API not available.')
        return
      }
      set({ isLoadingChats: true, error: null })
      try {
        const result = await dbApi.getAllChats('updated_at', 'DESC')
        console.log('[ChatHistoryStore] dbApi.getAllChats result:', result)
        if (result.success && result.data) {
          set({ chats: result.data, isLoadingChats: false })
        } else {
          console.error('[ChatHistoryStore] fetchChats - Failed to fetch chats:', result.error)
          set({ error: result.error || 'Failed to fetch chats.', isLoadingChats: false })
        }
      } catch (e) {
        console.error('[ChatHistoryStore] fetchChats - Exception:', e)
        set({ error: (e as Error).message, isLoadingChats: false })
      }
    },

    loadChat: async (chatId: string) => {
      if (!dbApi) {
        set({ error: 'DB API not available.', isLoadingMessages: false })
        return
      }
      // Optimistically set currentChatId, or wait for messages to load?
      // For now, set it immediately for responsiveness in UI selection.
      // If messages fail to load, UI should handle displaying an error for that chat.
      set({ currentChatId: chatId, isLoadingMessages: true, error: null, currentMessages: [] })
      try {
        const result = await dbApi.getMessagesByChatId(chatId, 'created_at', 'ASC')
        if (result.success && result.data) {
          set({ currentMessages: result.data, isLoadingMessages: false })
        } else {
          set({
            error: result.error || 'Failed to load messages.',
            isLoadingMessages: false,
            currentMessages: []
          })
        }
      } catch (e) {
        set({ error: (e as Error).message, isLoadingMessages: false, currentMessages: [] })
      }
    },

    createChatAndSelect: async (chatData) => {
      console.log('[ChatHistoryStore] createChatAndSelect called with:', chatData)
      if (!dbApi) {
        set({ error: 'DB API not available.' })
        console.error('[ChatHistoryStore] createChatAndSelect - DB API not available.')
        return null
      }
      set({ error: null })
      try {
        console.log('[ChatHistoryStore] Attempting to call dbApi.createChat with:', chatData)
        const result = await dbApi.createChat(chatData)
        console.log('[ChatHistoryStore] dbApi.createChat result:', result)
        if (result.success && result.data) {
          const newChat = result.data
          set((state) => {
            state.chats = [newChat, ...state.chats] // Add to beginning for immediate visibility
            state.currentChatId = newChat.id
            state.currentMessages = [] // New chat starts with no messages loaded
          })
          return newChat.id
        } else {
          console.error(
            '[ChatHistoryStore] createChatAndSelect - Failed to create chat:',
            result.error
          )
          set({ error: result.error || 'Failed to create chat.' })
          return null
        }
      } catch (e) {
        console.error('[ChatHistoryStore] createChatAndSelect - Exception:', e)
        set({ error: (e as Error).message })
        return null
      }
    },

    addMessageToCurrentChat: async (messageData) => {
      console.log('[ChatHistoryStore] addMessageToCurrentChat called with:', messageData)
      if (!dbApi) {
        set({ error: 'DB API not available.' })
        console.error('[ChatHistoryStore] addMessageToCurrentChat - DB API not available.')
        return
      }
      if (get().currentChatId !== messageData.chat_id) {
        // This message is not for the currently active chat,
        // we could still save it but not add to currentMessages, or log a warning.
        // For now, just save it. The chat list should update its `updated_at` via trigger.
        // We might need to refresh the specific chat in the `chats` array if we display `updated_at` directly.
        console.warn(
          '[ChatHistoryStore] Adding message to a non-active chat. Message saved, but not added to current view. ChatID:',
          messageData.chat_id,
          'CurrentActiveChatID:',
          get().currentChatId
        )
        // We should still try to save it.
      }
      set({ error: null })
      try {
        const result = await dbApi.addMessage(messageData)
        console.log('[ChatHistoryStore] dbApi.addMessage result:', result)
        if (result.success && result.data) {
          const newMessage = result.data
          if (get().currentChatId === newMessage.chat_id) {
            set((state) => {
              state.currentMessages.push(newMessage)
            })
          }
          // To ensure the chat list is re-ordered by `updated_at`, we should re-fetch or update the specific chat.
          // For simplicity now, let's re-fetch all chats if a message is added.
          // A more optimized approach would be to update just the one chat in the list.
          console.log('[ChatHistoryStore] Calling fetchChats after adding message.')
          get().fetchChats()
        } else {
          console.error(
            '[ChatHistoryStore] addMessageToCurrentChat - Failed to add message:',
            result.error
          )
          set({ error: result.error || 'Failed to add message.' })
        }
      } catch (e) {
        console.error('[ChatHistoryStore] addMessageToCurrentChat - Exception:', e)
        set({ error: (e as Error).message })
      }
    },

    deleteChatAndUpdateList: async (chatId: string) => {
      if (!dbApi) {
        set({ error: 'DB API not available.' })
        return
      }
      set({ error: null })
      try {
        const result = await dbApi.deleteChat(chatId)
        if (result.success) {
          set((state) => {
            state.chats = state.chats.filter((chat) => chat.id !== chatId)
            if (state.currentChatId === chatId) {
              state.currentChatId = null
              state.currentMessages = []
            }
          })
        } else {
          set({ error: result.error || 'Failed to delete chat.' })
        }
      } catch (e) {
        set({ error: (e as Error).message })
      }
    },

    updateChatTitleInList: async (chatId: string, title: string) => {
      if (!dbApi) {
        set({ error: 'DB API not available.' })
        return
      }
      set({ error: null })
      try {
        const result = await dbApi.updateChat(chatId, { title })
        if (result.success && result.data) {
          const updatedChat = result.data
          set((state) => {
            const index = state.chats.findIndex((c) => c.id === chatId)
            if (index !== -1) {
              state.chats[index] = updatedChat
            }
          })
        } else {
          set({ error: result.error || 'Failed to update chat title.' })
        }
      } catch (e) {
        set({ error: (e as Error).message })
      }
    },

    clearCurrentChat: () => {
      set({
        currentChatId: null,
        currentMessages: [],
        isLoadingMessages: false, // Reset loading state
        error: null // Clear any previous errors related to loading messages
      })
    },

    setError: (error: string | null) => {
      set({ error })
    }
  }))
)
