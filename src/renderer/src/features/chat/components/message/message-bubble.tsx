import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { MarkdownRenderer, CopyMessageButton } from '@/components/markdown-renderer'
import { MessagePartRenderer } from './message-part-renderer'
import { useEffect, useRef, useState } from 'react'
import { AgentGroupIndicator } from '../agent-indicator'
import OrchestrationTaskList from '../orchestration-task-list'
import { Subtask } from '../../../../../../shared/ipc-types'
import { useAnchoredToolParts } from '../../hooks/use-anchored-tool-parts'
import { splitReasoningText } from '../../../../../../shared/utils/reasoning-text'
import { hasRenderableAssistantContent } from '../../utils/message-part-utils'
import type { UIDataTypes, UIMessage, UITools } from 'ai'

// Streaming indicator - shown at bottom of message while generating
const StreamingIndicator =
  (): import('/mnt/e/Coding/open-source/Arion/node_modules/@types/react/jsx-runtime').JSX.Element => (
    <div className="streaming-indicator">
      <span className="dot">.</span>
      <span className="dot">.</span>
      <span className="dot">.</span>
    </div>
  )

// Extend the message type to include orchestration data
interface ExtendedMessage {
  id: string
  role: UIMessage['role']
  content?: string
  createdAt?: Date
  parts: UIMessage<unknown, UIDataTypes, UITools>['parts']
  hydrated?: boolean
  orchestration?: {
    subtasks?: Subtask[]
    agentsInvolved?: string[]
    completionTime?: number
  }
}

interface MessageBubbleProps {
  message: ExtendedMessage
  index: number
  isLatestUserMessage?: boolean
  isStreaming?: boolean
}

export const MessageBubble = forwardRef<HTMLDivElement, MessageBubbleProps>(
  ({ message, isLatestUserMessage, isStreaming = false }, ref) => {
    const isUser = message.role === 'user'
    const textFromParts = message.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('')
    const primaryText = message.content ?? textFromParts

    const isHydratedSnapshot = Boolean(message.hydrated)
    const [collapseReasoning, setCollapseReasoning] = useState(
      isHydratedSnapshot && !isUser ? true : false
    )
    const anchoredParts = useAnchoredToolParts({ message, collapseReasoning, isUser })
    const hasNonReasoningText =
      !isUser &&
      message.parts.some((part) => {
        if (part.type !== 'text') return false
        const { reasoningText, contentText } = splitReasoningText(part.text)
        if (reasoningText && contentText.length === 0) {
          return false
        }
        return part.state === 'streaming' || contentText.length > 0
      })

    useEffect(() => {
      if (isHydratedSnapshot && !isUser) {
        setCollapseReasoning(true)
      }
    }, [isHydratedSnapshot, isUser])

    useEffect(() => {
      if (hasNonReasoningText) {
        setCollapseReasoning(true)
      }
    }, [hasNonReasoningText])

    // Collapse reasoning when assistant text starts streaming: heuristic via a custom event
    const hasAssistantParts = !isUser && message.parts.length > 0
    const initializedRef = useRef(false)
    useEffect(() => {
      if (!hasAssistantParts || initializedRef.current) return
      initializedRef.current = true
      const handler = (): void => setCollapseReasoning(true)
      window.addEventListener('ai-assistant-text-start', handler)
      return () => window.removeEventListener('ai-assistant-text-start', handler)
    }, [hasAssistantParts])

    return (
      <div
        key={message.id}
        className={cn('flex flex-col w-full group', isUser ? 'items-end mt-3' : 'items-start')}
        ref={isLatestUserMessage ? ref : null}
      >
        <div
          className={cn(
            isUser
              ? 'max-w-[70%] bg-(--user-message-background) text-card-foreground rounded-2xl py-2 px-4'
              : 'w-full max-w-4xl text-foreground rounded-2xl px-0 dark:bg-card'
          )}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap">{primaryText}</div>
          ) : message.parts.length > 0 ? (
            <>
              {anchoredParts ||
                message.parts.map((part, partIndex) => (
                  <MessagePartRenderer
                    key={`${message.id}-part-${partIndex}`}
                    part={part}
                    messageId={message.id}
                    index={partIndex}
                    collapseReasoning={collapseReasoning}
                  />
                ))}
              {isStreaming && hasRenderableAssistantContent(message) && <StreamingIndicator />}
            </>
          ) : (
            <>
              <MarkdownRenderer content={primaryText || ''} />
              {isStreaming && primaryText && primaryText.trim().length > 0 && (
                <StreamingIndicator />
              )}

              {/* Display orchestration UI when metadata is available */}
              {message.orchestration && (
                <div className="mt-4">
                  <AgentGroupIndicator
                    agents={
                      message.orchestration.agentsInvolved?.map((agentId) => ({
                        id: agentId,
                        name: agentId,
                        type: agentId === 'orchestrator-1' ? 'orchestrator' : 'specialized',
                        isActive: true
                      })) || []
                    }
                    size="sm"
                    className="mb-2"
                    showActiveOnly={true}
                  />
                  <OrchestrationTaskList
                    subtasks={message.orchestration.subtasks || []}
                    className="mb-2"
                  />
                </div>
              )}
            </>
          )}
        </div>
        {primaryText && primaryText.length > 0 && !isStreaming && (
          <div
            className={cn(
              'mt-1 opacity-0 group-hover:opacity-100 transition-opacity',
              isUser ? 'mr-1' : 'ml-2'
            )}
          >
            <CopyMessageButton content={primaryText} />
          </div>
        )}
      </div>
    )
  }
)

MessageBubble.displayName = 'MessageBubble'
