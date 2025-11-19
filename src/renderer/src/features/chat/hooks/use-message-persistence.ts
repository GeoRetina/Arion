import { useEffect } from 'react'
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

  // Effect to save user messages when sdkMessages changes and a new user message appears
  useEffect(() => {
    const latestSdkMessage =
      sdkMessages.length > 0 ? (sdkMessages[sdkMessages.length - 1] as any) : null
    if (latestSdkMessage && latestSdkMessage.role === 'user') {
      const isAlreadySaved = currentMessagesFromStore.some(
        (storeMsg) => storeMsg.id === latestSdkMessage.id
      )
      if (!isAlreadySaved) {
        const currentChatId = useChatHistoryStore.getState().currentChatId // Get latest from store
        const handleUserMessageSave = async () => {
          // ONLY save if a chat session is already established in the DB
          if (currentChatId) {
            if (['system', 'user', 'assistant', 'tool'].includes(latestSdkMessage.role)) {
              const text = getTextFromParts(latestSdkMessage)
              await addMessageToCurrentChat({
                id: latestSdkMessage.id,
                chat_id: currentChatId,
                role: latestSdkMessage.role,
                content: text
              })
            }
          }
        }
        handleUserMessageSave()
      }
    }
  }, [
    sdkMessages, // This is the primary trigger
    currentMessagesFromStore, // To check if already saved (for the current chat in store)
    stableChatIdForUseChat, // For logging
    addMessageToCurrentChat
  ])

  // Hydrate SDK messages from DB history on first load for the active chat
  useEffect(() => {
    const shouldHydrate =
      stableChatIdForUseChat &&
      stableChatIdForUseChat === currentChatIdFromStore &&
      (sdkMessages?.length || 0) === 0 &&
      (currentMessagesFromStore?.length || 0) > 0

    if (!shouldHydrate) return

    const append = (chat as any)?.append
    if (typeof append !== 'function') return

    // Map DB messages to UIMessage shape (parts-based)
    const normalizeRole = (role: string): any => {
      if (role === 'data' || role === 'function') return 'assistant'
      return role
    }

    for (const m of currentMessagesFromStore) {
      append({
        id: m.id,
        role: normalizeRole(m.role),
        parts: m.content ? [{ type: 'text', text: m.content }] : []
      })
    }
  }, [stableChatIdForUseChat, currentChatIdFromStore, sdkMessages, currentMessagesFromStore, chat])
}
