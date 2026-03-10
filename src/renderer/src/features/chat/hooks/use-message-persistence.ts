import { useCallback, useEffect, useRef } from 'react'
import { type UIMessage } from 'ai'
import { useChatHistoryStore } from '@/stores/chat-history-store'
import type { Message } from '@/stores/chat-history-store'
import {
  hydrateStoredMessage,
  serializeMessageParts,
  type HydratedStoredMessage
} from '../utils/stored-message-hydration'

/**
 * Helper to read text from UIMessage parts
 * Exported for use in other components that need to extract text from messages
 */
export function getTextFromParts(message: UIMessage): string {
  const parts = (message as { parts?: unknown[] }).parts
  if (!Array.isArray(parts)) return ''
  return parts
    .map((p) => p as { type?: unknown; text?: unknown })
    .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('')
}

function getMessageCreatedAt(message: UIMessage): string | undefined {
  const createdAt = (message as { createdAt?: unknown }).createdAt
  return createdAt instanceof Date ? createdAt.toISOString() : undefined
}

type ChatControllerLike = {
  setMessages?: (messages: HydratedStoredMessage[]) => void
}

interface UseMessagePersistenceProps {
  sdkMessages: UIMessage[]
  currentMessagesFromStore: Message[]
  stableChatIdForUseChat: string | null
  currentChatIdFromStore: string | null
  chat: ChatControllerLike
}

/**
 * Hook to handle message persistence (saving and loading from database)
 * Combines both user message saving and message hydration logic
 */
export function useMessagePersistence({
  sdkMessages,
  currentMessagesFromStore,
  stableChatIdForUseChat,
  currentChatIdFromStore,
  chat
}: UseMessagePersistenceProps): { persistPendingUserMessages: (chatId: string) => Promise<void> } {
  const { addMessageToCurrentChat } = useChatHistoryStore()
  const lastHydrationRef = useRef<{ chatId: string | null; messageCount: number }>({
    chatId: null,
    messageCount: 0
  })

  const persistPendingUserMessages = useCallback(
    async (chatId: string) => {
      const storeMessages = useChatHistoryStore.getState().currentMessages
      const baselineMessages =
        storeMessages && storeMessages.length > 0 ? storeMessages : currentMessagesFromStore
      const persistedIds = new Set((baselineMessages || []).map((m) => m.id))

      for (const message of sdkMessages) {
        if (message.role !== 'user' || !message.id || persistedIds.has(message.id)) {
          continue
        }

        const text = getTextFromParts(message)
        if (!text || text.trim().length === 0) {
          continue
        }

        await addMessageToCurrentChat({
          id: message.id,
          chat_id: chatId,
          role: message.role as Message['role'],
          content: text,
          tool_calls: serializeMessageParts((message as { parts?: unknown[] }).parts),
          created_at: getMessageCreatedAt(message)
        })
        persistedIds.add(message.id)
      }
    },
    [sdkMessages, currentMessagesFromStore, addMessageToCurrentChat]
  )

  // Hydrate SDK messages from DB history when activating a chat
  useEffect(() => {
    const storeMessages = currentMessagesFromStore || []
    const storeCount = storeMessages.length
    const sdkMessageCount = (sdkMessages || []).length

    const shouldHydrate =
      stableChatIdForUseChat &&
      stableChatIdForUseChat === currentChatIdFromStore &&
      storeCount > 0 &&
      // Only hydrate when the store has more messages than the in-memory list.
      // This avoids overwriting rich, streaming state (tool calls, agent UIs) with
      // text-only DB snapshots once a response finishes.
      sdkMessageCount < storeCount

    if (!shouldHydrate) return

    const alreadyHydrated =
      lastHydrationRef.current.chatId === stableChatIdForUseChat &&
      lastHydrationRef.current.messageCount === storeCount
    if (alreadyHydrated) return

    const setMessages = chat?.setMessages
    if (typeof setMessages !== 'function') return

    const normalizedMessages = storeMessages.map((message) =>
      hydrateStoredMessage(message, { hydrated: true })
    )

    setMessages(normalizedMessages)
    lastHydrationRef.current = {
      chatId: stableChatIdForUseChat,
      messageCount: storeCount
    }
  }, [sdkMessages, stableChatIdForUseChat, currentChatIdFromStore, currentMessagesFromStore, chat])

  return {
    persistPendingUserMessages
  }
}
