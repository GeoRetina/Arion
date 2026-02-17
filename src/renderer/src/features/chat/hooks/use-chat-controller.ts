import { useEffect, useMemo, useRef } from 'react'
import { useChat, type UseChatHelpers } from '@ai-sdk/react'
import { DefaultChatTransport, type UIDataTypes, type UIMessage, type UITools } from 'ai'
import { Subtask } from '../../../../../shared/ipc-types'

import { createStreamingFetch } from '../utils/streaming-fetch'
import { useChatHistoryStore, type Message as StoreMessage } from '@/stores/chat-history-store'
import { useAgentOrchestrationStore } from '@/stores/agent-orchestration-store'
import { useMessagePersistence, getTextFromParts } from './use-message-persistence'

export type ChatMessage = UIMessage<unknown, UIDataTypes, UITools>

type ExtendedMessage = ChatMessage & {
  orchestration?: {
    subtasks?: Subtask[]
    agentsInvolved?: string[]
    completionTime?: number
  }
}

interface UseChatControllerOptions {
  stableChatIdForUseChat: string | undefined
  currentMessagesFromStore: StoreMessage[]
  currentChatIdFromStore: string | null
  setIsStreamingUi: (value: boolean) => void
}

export function useChatController({
  stableChatIdForUseChat,
  currentMessagesFromStore,
  currentChatIdFromStore,
  setIsStreamingUi
}: UseChatControllerOptions): {
  chat: UseChatHelpers<ChatMessage>
  sdkMessages: ChatMessage[]
  sdkError: Error | undefined
  stop: (() => void) | undefined
} {
  const { createChatAndSelect, addMessageToCurrentChat } = useChatHistoryStore()
  const persistRef = useRef<(chatId: string) => Promise<void>>(async () => {})

  const streamingFetch = useMemo(() => createStreamingFetch(), [])
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        fetch: streamingFetch as unknown as typeof fetch
      }),
    [streamingFetch]
  )

  const chat = useChat<ChatMessage>({
    id: stableChatIdForUseChat,
    transport,
    onError: () => {
      setIsStreamingUi(false)
    },
    onFinish: async ({ message }) => {
      const assistantMessage: ExtendedMessage = { ...message }
      setIsStreamingUi(false)
      let currentChatId = useChatHistoryStore.getState().currentChatId
      if (!currentChatId && stableChatIdForUseChat) {
        const newChatId = await createChatAndSelect({ id: stableChatIdForUseChat })
        if (newChatId) currentChatId = newChatId
      }

      const orchestrationStore = useAgentOrchestrationStore.getState()
      const { activeSessionId, subtasks, agentsInvolved } = orchestrationStore

      if (activeSessionId && (subtasks.length > 0 || agentsInvolved.length > 0)) {
        assistantMessage.orchestration = {
          subtasks: subtasks,
          agentsInvolved: agentsInvolved.map((agent) => agent.id),
          completionTime: Date.now()
        }

        orchestrationStore.resetOrchestration()
      }

      if (currentChatId) {
        await persistRef.current(currentChatId)

        const existingMsg = currentMessagesFromStore.find((m) => m.id === assistantMessage.id)
        const text = getTextFromParts(assistantMessage)
        if (!existingMsg && text && text.trim().length > 0) {
          await addMessageToCurrentChat({
            id: assistantMessage.id,
            chat_id: currentChatId,
            role: assistantMessage.role,
            content: text,
            orchestration: assistantMessage.orchestration
              ? JSON.stringify(assistantMessage.orchestration)
              : undefined
          })
        }
      }
    }
  })

  const sdkMessages = chat.messages
  const { persistPendingUserMessages } = useMessagePersistence({
    sdkMessages,
    currentMessagesFromStore,
    stableChatIdForUseChat: stableChatIdForUseChat ?? null,
    currentChatIdFromStore,
    chat
  })

  useEffect(() => {
    persistRef.current = persistPendingUserMessages
  }, [persistPendingUserMessages])

  return {
    chat,
    sdkMessages,
    sdkError: chat.error,
    stop: chat.stop
  }
}
