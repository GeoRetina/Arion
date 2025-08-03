import { MemoizedMarkdown } from '@/components/markdown-renderer'
import ToolCallDisplay from '../tool-call-display'
import { detectToolUIComponent, detectNestedToolUIComponents } from '../../utils/tool-ui-component-detection'
import type { ToolInvocation } from '../../utils/tool-ui-component-detection'

interface MessagePartRendererProps {
  part: any
  messageId: string
  index: number
}

export const MessagePartRenderer = ({ part, messageId, index }: MessagePartRendererProps) => {
  if (!part || typeof part.type !== 'string') {
    return null
  }

  switch (part.type) {
    case 'text':
      if (typeof part.text === 'string') {
        return (
          <MemoizedMarkdown
            key={`${messageId}-text-${index}`}
            content={part.text}
            id={`${messageId}-text-${index}`}
            isAssistant={true}
          />
        )
      } else {
        return null
      }
    case 'tool-invocation':
      const toolInvocation = part.toolInvocation
      if (
        toolInvocation &&
        typeof toolInvocation === 'object' &&
        toolInvocation.toolCallId &&
        toolInvocation.toolName
      ) {
        const { toolCallId, toolName, args, state } = toolInvocation

        // Check if this tool should render a special UI component
        const toolUIComponent = detectToolUIComponent(toolInvocation as ToolInvocation)
        if (toolUIComponent) {
          const Component = toolUIComponent.component
          return (
            <div key={toolUIComponent.key} className="pt-4">
              <Component {...toolUIComponent.props} />
            </div>
          )
        }

        // Check for nested tool results that should render special UI components
        if (state === 'result' && toolInvocation.result) {
          const nestedUIComponents = detectNestedToolUIComponents(toolInvocation.result)
          
          if (nestedUIComponents.length > 0) {
            // Render the main tool call display and nested UI components
            return (
              <div key={toolCallId} className="space-y-4">
                {/* Render the main tool call display */}
                <ToolCallDisplay
                  toolName={toolName}
                  args={args}
                  status="completed"
                  result={toolInvocation.result}
                  className="w-full text-left"
                />
                {/* Render nested UI components */}
                {nestedUIComponents.map((uiComponent) => {
                  const Component = uiComponent.component
                  return (
                    <div key={`${toolCallId}-${uiComponent.key}`} className="pt-4">
                      <Component {...uiComponent.props} />
                    </div>
                  )
                })}
              </div>
            )
          }
        }

        // For all other tool calls, or if display_chart result is incomplete, use ToolCallDisplay
        let status: 'loading' | 'completed' | 'error' = 'loading'
        let toolResultData: any = undefined

        if (state === 'result') {
          toolResultData = toolInvocation.result
          const isError =
            toolInvocation.isError ||
            (toolResultData && typeof toolResultData === 'object' && toolResultData.isError)
          status = isError ? 'error' : 'completed'
        } else if (state === 'error') {
          status = 'error'
          toolResultData = toolInvocation.error
        } else if (state === 'partial-call' || state === 'call') {
          status = 'loading'
        }

        return (
          <ToolCallDisplay
            key={toolCallId}
            toolName={toolName}
            args={args}
            status={status}
            result={toolResultData}
            className="w-full text-left"
          />
        )
      } else {
        return null
      }
    default:
      return null
  }
}