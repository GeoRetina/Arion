import { MarkdownRenderer } from '@/components/markdown-renderer'
import React, { useEffect, useState } from 'react'
import ToolCallDisplay from '../tool-call-display'
import {
  detectToolUIComponent,
  detectNestedToolCalls
} from '../../utils/tool-ui-component-detection'
import type { ToolInvocation } from '../../utils/tool-ui-component-detection'
import { determineToolStatus, normalizeToolInvocationPart } from '../../utils/message-part-utils'
import {
  COMPONENT_TYPES,
  TOOL_STATES,
  CALL_AGENT_TOOL_NAME
} from '../../constants/message-constants'
import type { MessagePartRendererProps } from '../../types/message-types'
import { splitReasoningText } from '../../../../../../shared/utils/reasoning-text'

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
  } catch {
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
  toolResult: unknown,
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
  } catch {
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
}): import('/mnt/e/Coding/open-source/Arion/node_modules/@types/react/jsx-runtime').JSX.Element {
  const [isOpen, setIsOpen] = useState(true)
  useEffect(() => {
    // Collapse when normal text starts; otherwise keep open while reasoning streams
    if (collapseReasoning) {
      setIsOpen(false)
    } else if (isStreamingReasoning) {
      setIsOpen(true)
    }
  }, [collapseReasoning, isStreamingReasoning])

  return (
    <details key={`${messageId}-reasoning-${index}`} className="mt-2 mb-2 w-full" open={isOpen}>
      <summary className="cursor-pointer select-none text-sm tracking-wide text-muted-foreground/80 hover:text-foreground">
        Thoughts
      </summary>
      <div className="mt-2 rounded-md border border-border/40 bg-background p-3 text-sm text-muted-foreground **:text-muted-foreground [&_.prose]:text-sm! [&_.prose_p]:text-sm! [&_.prose_h1]:text-base! [&_.prose_h2]:text-base! [&_.prose_h3]:text-base! [&_.prose_li]:text-sm!">
        <MarkdownRenderer content={text} />
      </div>
    </details>
  )
}

export const MessagePartRenderer = ({
  part,
  messageId,
  index,
  collapseReasoning
}: InternalRendererProps):
  | import('/mnt/e/Coding/open-source/Arion/node_modules/@types/react/jsx-runtime').JSX.Element
  | null => {
  // Input validation
  if (!part || typeof part !== 'object' || typeof part.type !== 'string') {
    return null
  }

  const toolInvocation = normalizeToolInvocationPart(part)
  if (toolInvocation) {
    const { toolCallId, toolName, args, state } = toolInvocation

    // Check if this tool should render a special UI component
    const toolUIComponent = detectToolUIComponent(toolInvocation)
    if (toolUIComponent) {
      const Component = toolUIComponent.component
      const baseComponent = (
        <div className="pt-4">
          <Component {...toolUIComponent.props} />
        </div>
      )

      // Special handling for call_agent tool to also show nested tool calls
      if (toolName === CALL_AGENT_TOOL_NAME && state === TOOL_STATES.RESULT) {
        const nestedResult = renderNestedToolCalls(toolInvocation.result, toolCallId, baseComponent)
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
              {nestedToolCalls.map((nestedTool, nestedIndex) =>
                renderNestedToolCall(nestedTool, toolCallId, nestedIndex)
              )}
            </div>
          </div>
        )
      }
    }

    // For all other tool calls, use ToolCallDisplay with proper error handling
    const status = determineToolStatus(toolInvocation)
    let toolResultData: unknown = undefined

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
  }

  try {
    switch (part.type) {
      case COMPONENT_TYPES.TEXT:
        if (typeof part.text === 'string') {
          const text = part.text
          const { reasoningText, contentText, hasOpenTag } = splitReasoningText(text)
          if (reasoningText !== undefined) {
            const trimmedReasoning = reasoningText.trim()
            const trimmedContent = contentText.trim()
            if (trimmedReasoning.length === 0 && trimmedContent.length === 0) return null
            const isStreamingReasoning = hasOpenTag || part.state === 'streaming'
            return (
              <>
                {trimmedReasoning.length > 0 && (
                  <ThoughtsPart
                    text={reasoningText}
                    messageId={messageId}
                    index={index}
                    collapseReasoning={collapseReasoning}
                    isStreamingReasoning={isStreamingReasoning}
                  />
                )}
                {trimmedContent.length > 0 && (
                  <MarkdownRenderer key={`${messageId}-text-${index}`} content={contentText} />
                )}
              </>
            )
          }

          // No reasoning tags/prefixes -> render as normal text
          return <MarkdownRenderer key={`${messageId}-text-${index}`} content={text} />
        } else {
          return null
        }

      case COMPONENT_TYPES.REASONING:
        if (typeof part.text === 'string') {
          const reasoningText = part.text
          if (reasoningText.trim().length === 0) return null
          const isStreamingReasoning = part.state === 'streaming'
          return (
            <ThoughtsPart
              text={reasoningText}
              messageId={messageId}
              index={index}
              collapseReasoning={collapseReasoning}
              isStreamingReasoning={isStreamingReasoning}
            />
          )
        }
        return null

      default:
        return null
    }
  } catch {
    // Fallback UI for rendering errors
    return (
      <div className="p-2 border border-red-200 rounded bg-red-50 dark:bg-red-950/20">
        <p className="text-red-700 dark:text-red-400 text-sm">Failed to render message part</p>
      </div>
    )
  }
}
