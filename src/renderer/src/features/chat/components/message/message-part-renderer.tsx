import { MemoizedMarkdown } from '@/components/markdown-renderer'
import React, { useEffect, useState } from 'react'
import ToolCallDisplay from '../tool-call-display'
import {
  detectToolUIComponent,
  detectNestedToolCalls
} from '../../utils/tool-ui-component-detection'
import type { ToolInvocation } from '../../utils/tool-ui-component-detection'
import {
  COMPONENT_TYPES,
  TOOL_STATES,
  TOOL_STATUS,
  CALL_AGENT_TOOL_NAME,
  type ToolStatus
} from '../../constants/message-constants'
import type { MessagePartRendererProps } from '../../types/message-types'

/**
 * Determines the status of a tool invocation based on its state and error flags
 */
function determineToolStatus(toolInvocation: ToolInvocation): ToolStatus {
  if (toolInvocation.state === TOOL_STATES.ERROR) {
    return TOOL_STATUS.ERROR
  }

  if (toolInvocation.state === TOOL_STATES.RESULT) {
    const isError =
      toolInvocation.isError ||
      (toolInvocation.result &&
        typeof toolInvocation.result === 'object' &&
        toolInvocation.result.isError)
    return isError ? TOOL_STATUS.ERROR : TOOL_STATUS.COMPLETED
  }

  return TOOL_STATUS.LOADING
}

/**
 * Renders a single nested tool call with its appropriate UI component
 */
function renderNestedToolCall(
  nestedTool: ToolInvocation,
  parentToolCallId: string,
  index: number
): React.ReactElement {
  const key = `${parentToolCallId}-${nestedTool.toolCallId}-${index}`

  try {
    // Check if this nested tool should render a special UI component
    const nestedToolUIComponent = detectToolUIComponent(nestedTool)
    const status = determineToolStatus(nestedTool)

    if (nestedToolUIComponent) {
      // Render both the tool call display AND the special UI component
      const NestedComponent = nestedToolUIComponent.component

      return (
        <div key={key} className="space-y-2">
          {/* Show the tool call display */}
          <ToolCallDisplay
            toolName={nestedTool.toolName}
            args={nestedTool.args}
            status={status}
            result={nestedTool.result}
            className="w-full text-left"
          />
          {/* Show the special UI component */}
          <NestedComponent {...nestedToolUIComponent.props} />
        </div>
      )
    } else {
      // Render regular tool call display for nested tool
      return (
        <ToolCallDisplay
          key={key}
          toolName={nestedTool.toolName}
          args={nestedTool.args}
          status={status}
          result={nestedTool.result}
          className="w-full text-left"
        />
      )
    }
  } catch (error) {
    // Fallback to basic display
    return (
      <div key={key} className="p-2 border border-red-200 rounded bg-red-50 dark:bg-red-950/20">
        <p className="text-red-700 dark:text-red-400 text-sm">
          Failed to render tool: {nestedTool.toolName || 'Unknown'}
        </p>
      </div>
    )
  }
}

/**
 * Renders nested tool calls for agent execution results
 */
function renderNestedToolCalls(
  toolResult: any,
  parentToolCallId: string,
  parentComponent: React.ReactElement
): React.ReactElement | null {
  if (!toolResult) {
    return parentComponent
  }

  try {
    const nestedToolCalls = detectNestedToolCalls(toolResult, parentToolCallId)

    if (nestedToolCalls.length === 0) {
      return parentComponent
    }

    return (
      <div className="space-y-4">
        {/* Render the parent component (agent call display) */}
        {parentComponent}

        {/* Render nested tool calls */}
        <div className="space-y-2" role="group" aria-label="Nested tool calls">
          {nestedToolCalls.map((nestedTool, index) =>
            renderNestedToolCall(nestedTool, parentToolCallId, index)
          )}
        </div>
      </div>
    )
  } catch (error) {
    return parentComponent // Fallback to just showing the parent component
  }
}

type InternalRendererProps = MessagePartRendererProps & { collapseReasoning?: boolean }

function ThoughtsPart({
  text,
  messageId,
  index,
  collapseReasoning,
  isStreamingReasoning
}: {
  text: string
  messageId: string
  index: number
  collapseReasoning?: boolean
  isStreamingReasoning?: boolean
}) {
  const [isOpen, setIsOpen] = useState(true)
  useEffect(() => {
    // Auto-expand when reasoning chunks are streaming; collapse when normal text starts
    if (isStreamingReasoning) {
      setIsOpen(true)
    } else if (collapseReasoning) {
      setIsOpen(false)
    }
  }, [collapseReasoning, isStreamingReasoning])

  return (
    <details key={`${messageId}-reasoning-${index}`} className="mt-2 mb-2 w-full" open={isOpen}>
      <summary className="cursor-pointer select-none text-sm tracking-wide text-muted-foreground/80 hover:text-foreground">
        Thoughts
      </summary>
      <div className="mt-2 rounded-md border border-border/40 bg-background p-3 text-sm text-muted-foreground [&_*]:text-muted-foreground [&_.prose]:!text-sm [&_.prose_p]:!text-sm [&_.prose_h1]:!text-base [&_.prose_h2]:!text-base [&_.prose_h3]:!text-base [&_.prose_li]:!text-sm">
        <MemoizedMarkdown
          content={text}
          id={`${messageId}-reasoning-${index}`}
          isAssistant={true}
        />
      </div>
    </details>
  )
}

export const MessagePartRenderer = ({
  part,
  messageId,
  index,
  collapseReasoning
}: InternalRendererProps) => {
  // Input validation
  if (!part || typeof part !== 'object' || typeof part.type !== 'string') {
    return null
  }

  try {
    switch (part.type) {
      case COMPONENT_TYPES.TEXT:
        if (typeof part.text === 'string') {
          const text = part.text
          const openIdx = text.toLowerCase().indexOf('<think>')
          const closeIdx = text.toLowerCase().indexOf('</think>')

          // Case 1: Open tag present, no close yet -> stream reasoning only
          if (openIdx >= 0 && (closeIdx === -1 || closeIdx < openIdx)) {
            const reasoningText = text.slice(openIdx + '<think>'.length).trim()
            if (reasoningText.length === 0) return null
            return (
              <ThoughtsPart
                text={reasoningText}
                messageId={messageId}
                index={index}
                // Keep expanded while reasoning is streaming
                collapseReasoning={false}
                isStreamingReasoning={true}
              />
            )
          }

          // Case 2: Complete <think>...</think> present -> show reasoning + remaining (outside container)
          if (openIdx >= 0 && closeIdx > openIdx) {
            const reasoningText = text.slice(openIdx + '<think>'.length, closeIdx).trim()
            const remaining = (
              text.slice(0, openIdx) + text.slice(closeIdx + '</think>'.length)
            ).trim()
            return (
              <>
                {reasoningText.length > 0 && (
                  <ThoughtsPart
                    text={reasoningText}
                    messageId={messageId}
                    index={index}
                    // Reasoning section completed; allow collapse based on parent signal
                    collapseReasoning={collapseReasoning}
                    isStreamingReasoning={false}
                  />
                )}
                {remaining.length > 0 && (
                  <MemoizedMarkdown
                    key={`${messageId}-text-${index}`}
                    content={remaining}
                    id={`${messageId}-text-${index}`}
                    isAssistant={true}
                  />
                )}
              </>
            )
          }

          // Case 3: No <think> tags -> render as normal text
          return (
            <MemoizedMarkdown
              key={`${messageId}-text-${index}`}
              content={text}
              id={`${messageId}-text-${index}`}
              isAssistant={true}
            />
          )
        } else {
          return null
        }

      case COMPONENT_TYPES.REASONING:
        if (typeof (part as any).text === 'string' && (part as any).text.length > 0) {
          return (
            <ThoughtsPart
              text={(part as any).text}
              messageId={messageId}
              index={index}
              // Keep expanded while reasoning is streaming
              collapseReasoning={false}
              isStreamingReasoning={true}
            />
          )
        }
        return null

      case COMPONENT_TYPES.TOOL_INVOCATION:
        const toolInvocation = part.toolInvocation
        if (
          !toolInvocation ||
          typeof toolInvocation !== 'object' ||
          typeof toolInvocation.toolCallId !== 'string' ||
          typeof toolInvocation.toolName !== 'string'
        ) {
          return null
        }

        const { toolCallId, toolName, args, state } = toolInvocation

        // Check if this tool should render a special UI component
        const toolUIComponent = detectToolUIComponent(toolInvocation as ToolInvocation)
        if (toolUIComponent) {
          const Component = toolUIComponent.component
          const baseComponent = (
            <div className="pt-4">
              <Component {...toolUIComponent.props} />
            </div>
          )

          // Special handling for call_agent tool to also show nested tool calls
          if (toolName === CALL_AGENT_TOOL_NAME && state === TOOL_STATES.RESULT) {
            const nestedResult = renderNestedToolCalls(
              toolInvocation.result,
              toolCallId,
              baseComponent
            )
            return <div key={toolUIComponent.key}>{nestedResult}</div>
          }

          // Default rendering for other special UI components
          return <div key={toolUIComponent.key}>{baseComponent}</div>
        }

        // Check for nested tool results that should render special UI components
        if (state === 'result' && toolInvocation.result) {
          const nestedToolCalls = detectNestedToolCalls(toolInvocation.result, toolCallId)

          if (nestedToolCalls.length > 0) {
            // Render the main tool call display and nested components
            return (
              <div key={toolCallId} className="space-y-4">
                {/* Render the main tool call display (agent call or regular tool) */}
                <ToolCallDisplay
                  toolName={toolName}
                  args={args || {}}
                  status="completed"
                  result={toolInvocation.result}
                  className="w-full text-left"
                />
                {/* Render nested tool calls using the proper rendering function */}
                <div className="space-y-2">
                  {nestedToolCalls.map((nestedTool, index) =>
                    renderNestedToolCall(nestedTool, toolCallId, index)
                  )}
                </div>
              </div>
            )
          }
        }

        // For all other tool calls, use ToolCallDisplay with proper error handling
        const status = determineToolStatus(toolInvocation as ToolInvocation)
        let toolResultData: any = undefined

        if (state === TOOL_STATES.RESULT) {
          toolResultData = toolInvocation.result
        } else if (state === TOOL_STATES.ERROR) {
          toolResultData = toolInvocation.error
        }

        return (
          <ToolCallDisplay
            key={toolCallId}
            toolName={toolName}
            args={args || {}}
            status={status}
            result={toolResultData}
            className="w-full text-left"
          />
        )

      default:
        return null
    }
  } catch (error) {
    // Fallback UI for rendering errors
    return (
      <div className="p-2 border border-red-200 rounded bg-red-50 dark:bg-red-950/20">
        <p className="text-red-700 dark:text-red-400 text-sm">Failed to render message part</p>
      </div>
    )
  }
}
