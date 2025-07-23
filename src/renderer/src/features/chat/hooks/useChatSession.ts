import { useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useChatHistoryStore, type Message as StoreMessage } from '@/stores/chat-history-store'
import { v4 as uuidv4 } from 'uuid'
import type { Message as SDKMessage } from '@ai-sdk/react'

interface UseChatSessionReturn {
  stableChatIdForUseChat: string | undefined
  sdkCompatibleInitialMessages: SDKMessage[]
  currentChatIdFromStore: string | null // Exposing this for potential use in ChatInterface
  currentMessagesFromStore: StoreMessage[] // Exposing this for potential use in ChatInterface
  isLoadingMessagesFromStore: boolean // Exposing this
}

export function useChatSession(): UseChatSessionReturn {
  const navigate = useNavigate()
  const { chatId: chatIdFromUrl } = useParams<{ chatId: string }>()

  const {
    currentChatId: currentChatIdFromStore,
    currentMessages: currentMessagesFromStore,
    isLoadingMessages: isLoadingMessagesFromStore,
    loadChat,
    clearCurrentChat,
    createChatAndSelect
  } = useChatHistoryStore()

  const processingNewChatUrlRef = useRef(false)

  // Effect to synchronize URL chatId with chat history store
  useEffect(() => {
    console.log(
      '[useChatSession] URL Sync Effect. URL:',
      chatIdFromUrl,
      'StoreChatID:',
      currentChatIdFromStore,
      'ProcessingNewRef:',
      processingNewChatUrlRef.current
    )

    if (chatIdFromUrl === 'new') {
      if (!processingNewChatUrlRef.current) {
        processingNewChatUrlRef.current = true

        if (currentChatIdFromStore !== null) {
          console.log('[useChatSession] Navigated to /new, clearing current chat in store.')
          clearCurrentChat() // Clears messages and currentChatId from store
        }
        const newSessionId = uuidv4()
        console.log(
          `[useChatSession] Detected 'new' chat URL, navigating to /chat/${newSessionId}. Chat record will be created on first message.`
        )
        navigate(`/chat/${newSessionId}`, { replace: true })
        // processingNewChatUrlRef.current will be reset when chatIdFromUrl is no longer 'new'
      }
    } else if (chatIdFromUrl && chatIdFromUrl !== 'new') {
      if (processingNewChatUrlRef.current) {
        console.log("[useChatSession] URL is no longer 'new'. Resetting processingNewChatUrlRef.")
        processingNewChatUrlRef.current = false
      }

      if (chatIdFromUrl !== currentChatIdFromStore) {
        console.log(
          `[useChatSession] URL chatId ${chatIdFromUrl} differs from store ${currentChatIdFromStore}. Loading chat (won't create if not found).`
        )
        // loadChat should set currentChatId and messages in the store if found
        loadChat(chatIdFromUrl)
      }
    } else if (!chatIdFromUrl && currentChatIdFromStore) {
      // If there's no chat ID in the URL, but there is one in the store (e.g., after a hot reload or returning to the app)
      // navigate to the stored chat ID.
      console.log(
        `[useChatSession] No URL chatId, but store has ${currentChatIdFromStore}. Navigating.`
      )
      navigate(`/chat/${currentChatIdFromStore}`, { replace: true })
    }
    // If !chatIdFromUrl && !currentChatIdFromStore, we do nothing, user might be on a different page or app just loaded.
    // ChatInterface might show a "select a chat or start new" message.
  }, [chatIdFromUrl, currentChatIdFromStore, loadChat, clearCurrentChat, navigate])

  const stableChatIdForUseChat = useMemo(() => {
    if (chatIdFromUrl && chatIdFromUrl !== 'new') {
      return chatIdFromUrl
    }
    // If chatIdFromUrl is 'new' or undefined, we don't have a stable ID for useChat yet.
    // useChat hook requires a stable 'id' or it re-initializes.
    // The effect above will navigate to a UUID, and then this memo will update.
    return undefined
  }, [chatIdFromUrl])

  const sdkCompatibleInitialMessages = useMemo(() => {
    // Only provide initial messages if the stableChatId (from URL, after 'new' is resolved)
    // matches the one in the store. This avoids loading messages from a previous chat
    // into a new chat session before the store has updated.
    const messagesToConsider =
      stableChatIdForUseChat === currentChatIdFromStore ? currentMessagesFromStore : []

    return messagesToConsider
      .map((storeMsg) => {
        const sdkMessageCandidate: Partial<SDKMessage> & {
          role?: 'system' | 'user' | 'assistant' | 'data' // Explicitly list allowed roles
        } = {
          id: storeMsg.id,
          content: storeMsg.content,
          createdAt: storeMsg.created_at ? new Date(storeMsg.created_at) : undefined
        }
        if (['system', 'user', 'assistant', 'data'].includes(storeMsg.role)) {
          sdkMessageCandidate.role = storeMsg.role as 'system' | 'user' | 'assistant' | 'data'
        }
        return sdkMessageCandidate
      })
      .filter(
        (msg): msg is SDKMessage =>
          msg.role !== undefined && typeof msg.id === 'string' && typeof msg.content === 'string'
      )
  }, [currentChatIdFromStore, currentMessagesFromStore, stableChatIdForUseChat])

  return {
    stableChatIdForUseChat,
    sdkCompatibleInitialMessages,
    currentChatIdFromStore, // Exposing for ChatInterface to use if needed
    currentMessagesFromStore, // Exposing for ChatInterface to use if needed
    isLoadingMessagesFromStore
  }
}
