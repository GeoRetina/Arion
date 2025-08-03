import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { MemoizedMarkdown, CopyMessageButton } from '@/components/markdown-renderer'
import { MessagePartRenderer } from './message-part-renderer'
import { AgentGroupIndicator } from '../agent-indicator'
import OrchestrationTaskList from '../orchestration-task-list'
import { Subtask } from '../../../../../../shared/ipc-types'

// Extend the message type to include orchestration data
interface ExtendedMessage {
  id: string
  role: 'system' | 'user' | 'assistant' | 'data' | 'tool'
  content: string
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
}

export const MessageBubble = forwardRef<HTMLDivElement, MessageBubbleProps>(
  ({ message, isLatestUserMessage }, ref) => {
    const isUser = message.role === 'user'

    return (
      <div
        key={message.id}
        className={cn(
          'flex flex-col w-full group',
          isUser ? 'items-end mt-3' : 'items-start'
        )}
        ref={isLatestUserMessage ? ref : null}
      >
        <div
          className={cn(
            isUser
              ? 'max-w-[70%] bg-[var(--user-message-background)] text-card-foreground rounded-2xl py-2 px-4'
              : 'w-full max-w-4xl text-foreground rounded-2xl px-0 dark:bg-card'
          )}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap">{message.content}</div>
          ) : Array.isArray(message.parts) && message.parts.length > 0 ? (
            message.parts.map((part, partIndex) => (
              <MessagePartRenderer
                key={`${message.id}-part-${partIndex}`}
                part={part}
                messageId={message.id}
                index={partIndex}
              />
            ))
          ) : (
            <>
              <MemoizedMarkdown 
                content={message.content} 
                id={message.id} 
                isAssistant={true} 
              />
              
              {/* Display orchestration UI when metadata is available */}
              {message.orchestration && (
                <div className="mt-4">
                  <AgentGroupIndicator 
                    agents={message.orchestration.agentsInvolved?.map(agentId => ({
                      id: agentId,
                      name: agentId,
                      type: agentId === 'orchestrator-1' ? 'orchestrator' : 'specialized',
                      isActive: true
                    })) || []}
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
        {(message.content ||
          (Array.isArray(message.parts) &&
            message.parts.some(
              (p) => p?.type === 'text' && typeof (p as any).text === 'string'
            ))) && (
          <div
            className={cn(
              'mt-1 opacity-0 group-hover:opacity-100 transition-opacity',
              isUser ? 'mr-1' : 'ml-2'
            )}
          >
            <CopyMessageButton
              content={
                message.content ||
                (message.parts?.find((p) => p?.type === 'text') as any)?.text ||
                ''
              }
            />
          </div>
        )}
      </div>
    )
  }
)

MessageBubble.displayName = 'MessageBubble'