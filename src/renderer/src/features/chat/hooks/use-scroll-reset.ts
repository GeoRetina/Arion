import { useEffect, type RefObject } from 'react'

interface UseScrollResetProps {
  scrollAreaRef: RefObject<HTMLDivElement | null>
  chatId: string | null
}

/**
 * Hook to reset scroll position when switching chats
 * Finds the Radix UI ScrollArea viewport and resets its scroll position
 */
export function useScrollReset({ scrollAreaRef, chatId }: UseScrollResetProps) {
  useEffect(() => {
    if (scrollAreaRef.current) {
      // Find the scroll container inside ScrollArea (it's a div with data-radix-scroll-area-viewport)
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (viewport) {
        viewport.scrollTop = 0
      }
    }
  }, [chatId, scrollAreaRef])
}
