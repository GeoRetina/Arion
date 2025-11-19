import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { MemoizedMarkdown, CopyMessageButton } from '@/components/markdown-renderer'
import { MessagePartRenderer } from './message-part-renderer'
import { useEffect, useRef, useState } from 'react'
import { AgentGroupIndicator } from '../agent-indicator'
import OrchestrationTaskList from '../orchestration-task-list'
import { Subtask } from '../../../../../../shared/ipc-types'
import { useAnchoredToolParts } from '../../hooks/use-anchored-tool-parts'

// Extend the message type to include orchestration data
interface ExtendedMessage {
  id: string
  role: 'system' | 'user' | 'assistant' | 'data' | 'tool'
  content?: string
  createdAt?: Date
  parts?: any[]
  toolInvocations?: any[]
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
    const textFromParts = Array.isArray(message.parts)
      ? message.parts
          .filter((p) => p && p.type === 'text' && typeof (p as any).text === 'string')
          .map((p) => (p as any).text as string)
          .join('')
      : ''
    const primaryText = message.content ?? textFromParts

    const isHydratedSnapshot = Boolean((message as any).hydrated)
    const [collapseReasoning, setCollapseReasoning] = useState(
      isHydratedSnapshot && !isUser ? true : false
    )
    const anchoredParts = useAnchoredToolParts({ message, collapseReasoning, isUser })

    useEffect(() => {
      if (isHydratedSnapshot && !isUser) {
        setCollapseReasoning(true)
      }
    }, [isHydratedSnapshot, isUser])

    // Collapse reasoning when assistant text starts streaming: heuristic via a custom event
    const hasAssistantParts = !isUser && Array.isArray(message.parts)
    const initializedRef = useRef(false)
    useEffect(() => {
      if (!hasAssistantParts || initializedRef.current) return
      initializedRef.current = true
      const handler = () => setCollapseReasoning(true)
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
          ) : Array.isArray(message.parts) && message.parts.length > 0 ? (
            anchoredParts ||
            message.parts.map((part, partIndex) => (
              <MessagePartRenderer
                key={`${message.id}-part-${partIndex}`}
                part={part}
                messageId={message.id}
                index={partIndex}
                collapseReasoning={collapseReasoning}
              />
            ))
          ) : (
            <>
              <MemoizedMarkdown content={primaryText || ''} id={message.id} isAssistant={true} />

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
