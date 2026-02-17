import { useEffect, useRef } from 'react'
import type { UIDataTypes, UIMessage, UITools } from 'ai'
import { splitReasoningText } from '../../../../../shared/utils/reasoning-text'

type ChatMessage = UIMessage<unknown, UIDataTypes, UITools>

interface UseReasoningNotificationProps {
  isStreamingUi: boolean
  chatMessages: ChatMessage[]
}

/**
 * Hook to notify reasoning container to collapse when assistant starts streaming text
 * Dispatches a custom window event that reasoning components can listen to
 */
export function useReasoningNotification({
  isStreamingUi,
  chatMessages
}: UseReasoningNotificationProps): void {
  const lastTextStartRef = useRef<{ id?: string; hasText?: boolean }>({})

  useEffect(() => {
    if (!isStreamingUi || !Array.isArray(chatMessages)) return

    const lastMessage = chatMessages[chatMessages.length - 1]
    if (!lastMessage || lastMessage.role !== 'assistant') return

    const parts = Array.isArray(lastMessage.parts) ? lastMessage.parts : []
    const hasText = parts.some((part) => {
      if (!part || part.type !== 'text' || typeof part.text !== 'string') return false
      const { reasoningText, contentText } = splitReasoningText(part.text)
      if (reasoningText && contentText.length === 0) {
        return false
      }
      return part.state === 'streaming' || contentText.length > 0
    })

    const lastState = lastTextStartRef.current
    if (lastState.id !== lastMessage.id) {
      lastTextStartRef.current = { id: lastMessage.id, hasText }
      if (hasText) {
        window.dispatchEvent(new Event('ai-assistant-text-start'))
      }
      return
    }

    if (!lastState.hasText && hasText) {
      window.dispatchEvent(new Event('ai-assistant-text-start'))
    }

    lastTextStartRef.current.hasText = hasText
  }, [isStreamingUi, chatMessages])
}
