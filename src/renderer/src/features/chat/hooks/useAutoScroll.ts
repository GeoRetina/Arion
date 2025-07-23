import { useRef, useEffect } from 'react'
import type { Message as SDKMessage } from '@ai-sdk/react'

interface UseAutoScrollProps {
  messages: SDKMessage[]
  marginTop?: string
  scrollDelay?: number
  clearMarginDelay?: number
}

/**
 * Hook to manage auto-scrolling for new user messages in a chat
 * @param props Configuration options
 * @returns Object containing refs and helper functions
 */
export function useAutoScroll(props: UseAutoScrollProps) {
  const { messages, marginTop = '60px', scrollDelay = 100, clearMarginDelay = 1000 } = props

  // Ref to track the latest user message element
  const latestUserMessageRef = useRef<HTMLDivElement | null>(null)

  // Track the previous message count to identify when a new user message is added
  const prevMessageCountRef = useRef(messages.length)

  // Effect to handle scrolling to the latest user message
  useEffect(() => {
    // Check if a new message was added and it's from the user
    if (messages.length > prevMessageCountRef.current) {
      const latestMessage = messages[messages.length - 1]
      if (latestMessage.role === 'user') {
        // Use setTimeout to ensure DOM has updated
        setTimeout(() => {
          if (latestUserMessageRef.current) {
            console.log('[useAutoScroll] Smooth scrolling to latest user message')

            // Add space above the element temporarily for scrolling
            latestUserMessageRef.current.style.scrollMarginTop = marginTop

            // Use native scrollIntoView with smooth behavior
            latestUserMessageRef.current.scrollIntoView({
              behavior: 'smooth',
              block: 'start' // Position at the top of the viewport
            })

            // Remove the temporary style after scrolling completes
            setTimeout(() => {
              if (latestUserMessageRef.current) {
                latestUserMessageRef.current.style.scrollMarginTop = ''
              }
            }, clearMarginDelay)
          } else {
            console.error('[useAutoScroll] Reference to latest user message not available')
          }
        }, scrollDelay)
      }
    }

    prevMessageCountRef.current = messages.length
  }, [messages, marginTop, scrollDelay, clearMarginDelay])

  /**
   * Helper to determine if a message is the latest user message
   */
  const isLatestUserMessage = (message: SDKMessage, index: number): boolean => {
    return message.role === 'user' && index === messages.length - 1
  }

  return {
    latestUserMessageRef,
    isLatestUserMessage
  }
}
