import { useEffect, useMemo, useRef } from 'react'
import { useChat, type UseChatHelpers } from '@ai-sdk/react'
import { DefaultChatTransport, type UIDataTypes, type UIMessage, type UITools } from 'ai'
import { Subtask } from '../../../../../shared/ipc-types'

import { createStreamingFetch } from '../utils/streaming-fetch'
import { useChatHistoryStore, type Message as StoreMessage } from '@/stores/chat-history-store'
import { useAgentOrchestrationStore } from '@/stores/agent-orchestration-store'
import { useMessagePersistence, getTextFromParts } from './use-message-persistence'
import { serializeMessageParts } from '../utils/stored-message-hydration'

export type ChatMessage = UIMessage<unknown, UIDataTypes, UITools>

type ExtendedMessage = ChatMessage & {
  createdAt?: Date
  orchestration?: {
    subtasks?: Subtask[]
    agentsInvolved?: string[]
    completionTime?: number
  }
}

function getMessageCreatedAt(message: ChatMessage): string | undefined {
  const createdAt = (message as { createdAt?: unknown }).createdAt
  return createdAt instanceof Date ? createdAt.toISOString() : undefined
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
  const latestSdkMessagesRef = useRef<ChatMessage[]>([])

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
        const storeMessages = useChatHistoryStore.getState().currentMessages
        const persistedIds = new Set(storeMessages.map((storedMessage) => storedMessage.id))
        const assistantMessagesToPersist = latestSdkMessagesRef.current.filter(
          (sdkMessage) => sdkMessage.role === 'assistant' && typeof sdkMessage.id === 'string'
        )

        if (
          !assistantMessagesToPersist.some((sdkMessage) => sdkMessage.id === assistantMessage.id)
        ) {
          assistantMessagesToPersist.push(assistantMessage)
        }

        for (const sdkMessage of assistantMessagesToPersist) {
          if (!sdkMessage.id || persistedIds.has(sdkMessage.id)) {
            continue
          }

          const orchestrationPayload =
            sdkMessage.id === assistantMessage.id ? assistantMessage.orchestration : undefined
          const text = getTextFromParts(sdkMessage)
          const serializedParts = serializeMessageParts((sdkMessage as { parts?: unknown[] }).parts)
          const shouldPersistAssistantMessage = Boolean(
            text.trim().length > 0 || serializedParts || orchestrationPayload
          )

          if (!shouldPersistAssistantMessage) {
            continue
          }

          await addMessageToCurrentChat({
            id: sdkMessage.id,
            chat_id: currentChatId,
            role: sdkMessage.role,
            content: text,
            tool_calls: serializedParts,
            orchestration: orchestrationPayload ? JSON.stringify(orchestrationPayload) : undefined,
            created_at: getMessageCreatedAt(sdkMessage)
          })
          persistedIds.add(sdkMessage.id)
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

  useEffect(() => {
    latestSdkMessagesRef.current = chat.messages
  }, [chat.messages])

  return {
    chat,
    sdkMessages,
    sdkError: chat.error,
    stop: chat.stop
  }
}
