import { useCallback, useEffect, useRef } from 'react'
import { type UIMessage } from 'ai'
import { useChatHistoryStore } from '@/stores/chat-history-store'

/**
 * Helper to read text from UIMessage parts
 * Exported for use in other components that need to extract text from messages
 */
export function getTextFromParts(message: UIMessage<any, any, any>): string {
  const parts = (message as any).parts as Array<any> | undefined
  if (!Array.isArray(parts)) return ''
  return parts
    .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('')
}

type HydratedMessage = UIMessage & { content?: string; createdAt?: Date; hydrated?: boolean }

interface UseMessagePersistenceProps {
  sdkMessages: UIMessage[]
  currentMessagesFromStore: any[]
  stableChatIdForUseChat: string | null
  currentChatIdFromStore: string | null
  chat: any
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
}: UseMessagePersistenceProps) {
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
      const persistedIds = new Set((baselineMessages || []).map((m: any) => m.id))

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
          role: message.role as any,
          content: text
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

    const setMessages = (chat as any)?.setMessages
    if (typeof setMessages !== 'function') return

    // Map DB messages to UIMessage shape (parts-based)
    const normalizeRole = (role: string): any => {
      if (role === 'data' || role === 'function' || role === 'tool') return 'assistant'
      return role
    }

    const normalizedMessages: HydratedMessage[] = storeMessages.map((m) => {
      const textContent = m.content ?? ''
      const normalizedMessage: HydratedMessage = {
        id: m.id,
        role: normalizeRole(m.role),
        content: textContent,
        createdAt: m.created_at ? new Date(m.created_at) : undefined,
        parts: textContent ? [{ type: 'text', text: textContent }] : []
      }
      normalizedMessage.hydrated = true
      return normalizedMessage
    })

    setMessages(normalizedMessages)
    lastHydrationRef.current = {
      chatId: stableChatIdForUseChat,
      messageCount: storeCount
    }
  }, [
    sdkMessages,
    stableChatIdForUseChat,
    currentChatIdFromStore,
    currentMessagesFromStore,
    chat
  ])

  return {
    persistPendingUserMessages
  }
}
