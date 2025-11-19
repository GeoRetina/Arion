import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { MemoizedMarkdown, CopyMessageButton } from '@/components/markdown-renderer'
import { MessagePartRenderer } from './message-part-renderer'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AgentGroupIndicator } from '../agent-indicator'
import OrchestrationTaskList from '../orchestration-task-list'
import { Subtask } from '../../../../../../shared/ipc-types'

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
    const toolAnchorRef = useRef<Record<string, number>>({})
    const textPart = Array.isArray(message.parts)
      ? message.parts.find((p) => p && p.type === 'text' && typeof (p as any).text === 'string')
      : undefined
    const textContent =
      (textPart && typeof (textPart as any).text === 'string' && (textPart as any).text) ||
      (typeof message.content === 'string' ? message.content : '')
    const toolParts = Array.isArray(message.parts)
      ? message.parts.filter((p) => p && p.type === 'tool-invocation' && (p as any).toolInvocation)
      : []
    const textPartIndex = Array.isArray(message.parts)
      ? message.parts.findIndex((p) => p && p.type === 'text' && typeof (p as any).text === 'string')
      : -1
    const hasAnchoredToolFlow = Boolean(textPart && toolParts.length > 0 && !isUser)
    const firstToolAnchor = hasAnchoredToolFlow
      ? toolParts
          .map((part: any) => {
            const id = part.toolInvocation?.toolCallId
            return id && toolAnchorRef.current[id] !== undefined
              ? toolAnchorRef.current[id]
              : textContent.length
          })
          .reduce((min: number, val: number) => Math.min(min, val), textContent.length)
      : textContent.length

    useEffect(() => {
      if (isHydratedSnapshot && !isUser) {
        setCollapseReasoning(true)
      }
    }, [isHydratedSnapshot, isUser])

    // Reset anchors when the message changes
    useEffect(() => {
      toolAnchorRef.current = {}
    }, [message.id])

    // Capture the text length when each tool call first appears to anchor later text below it
    useEffect(() => {
      if (!hasAnchoredToolFlow) return
      const currentLength = textContent.length
      toolParts.forEach((part: any) => {
        const id = part.toolInvocation?.toolCallId
        if (id && toolAnchorRef.current[id] === undefined) {
          toolAnchorRef.current[id] = currentLength
        }
      })
    }, [hasAnchoredToolFlow, textContent, toolParts])

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
            (() => {
              if (!hasAnchoredToolFlow) {
                return message.parts.map((part, partIndex) => (
                  <MessagePartRenderer
                    key={`${message.id}-part-${partIndex}`}
                    part={part}
                    messageId={message.id}
                    index={partIndex}
                    collapseReasoning={collapseReasoning}
                  />
                ))
              }

              const rendered: ReactNode[] = []
              let cursor = 0
              let syntheticIndex = 0

              const pushTextSlice = (slice: string, key: string) => {
                if (!slice || slice.length === 0) return
                rendered.push(
                  <MessagePartRenderer
                    key={key}
                    part={{ type: 'text', text: slice } as any}
                    messageId={message.id}
                    index={syntheticIndex++}
                    collapseReasoning={collapseReasoning}
                  />
                )
              }

              message.parts.forEach((part, partIndex) => {
                if (!part || typeof part !== 'object') return
                if (part.type === 'text') {
                  // Text is handled via slices.
                  return
                }

                if (part.type === 'tool-invocation' && (part as any).toolInvocation) {
                  const toolCallId = (part as any).toolInvocation.toolCallId
                  const anchor =
                    (toolCallId && toolAnchorRef.current[toolCallId] !== undefined
                      ? toolAnchorRef.current[toolCallId]
                      : textContent.length) || 0

                  if (cursor < anchor) {
                    pushTextSlice(
                      textContent.slice(cursor, anchor),
                      `${message.id}-text-before-${toolCallId || partIndex}`
                    )
                    cursor = anchor
                  }

                  rendered.push(
                    <MessagePartRenderer
                      key={`${message.id}-part-${partIndex}`}
                      part={part}
                      messageId={message.id}
                      index={partIndex}
                      collapseReasoning={collapseReasoning}
                    />
                  )
                  syntheticIndex = Math.max(syntheticIndex, partIndex + 1)
                  return
                }

                // Other part types keep their natural order, but ensure leading text renders before them
                if (
                  hasAnchoredToolFlow &&
                  cursor === 0 &&
                  textPartIndex >= 0 &&
                  partIndex > textPartIndex
                ) {
                  if (cursor < firstToolAnchor) {
                    pushTextSlice(
                      textContent.slice(cursor, firstToolAnchor),
                      `${message.id}-text-before-other-${partIndex}`
                    )
                    cursor = firstToolAnchor
                  }
                }
                rendered.push(
                  <MessagePartRenderer
                    key={`${message.id}-part-${partIndex}`}
                    part={part}
                    messageId={message.id}
                    index={partIndex}
                    collapseReasoning={collapseReasoning}
                  />
                )
                syntheticIndex = Math.max(syntheticIndex, partIndex + 1)
              })

              // Remaining text after the last tool invocation
              if (textContent && cursor < textContent.length) {
                pushTextSlice(
                  textContent.slice(cursor),
                  `${message.id}-text-tail-${rendered.length}`
                )
              }

              return rendered
            })()
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
