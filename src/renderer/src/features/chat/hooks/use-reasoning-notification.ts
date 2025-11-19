import { useEffect } from 'react'

interface UseReasoningNotificationProps {
  isStreamingUi: boolean
  chatMessages: any[]
}

/**
 * Hook to notify reasoning container to collapse when assistant starts streaming text
 * Dispatches a custom window event that reasoning components can listen to
 */
export function useReasoningNotification({
  isStreamingUi,
  chatMessages
}: UseReasoningNotificationProps) {
  useEffect(() => {
    if (isStreamingUi) {
      const last = chatMessages[chatMessages.length - 1]
      if (last && last.role === 'assistant') {
        window.dispatchEvent(new Event('ai-assistant-text-start'))
      }
    }
  }, [isStreamingUi, chatMessages])
}
