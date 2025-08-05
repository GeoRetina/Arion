/**
 * Types for message part rendering
 */

export interface MessagePartRendererProps {
  part: MessagePart
  messageId: string
  index: number
}

export interface MessagePart {
  type: string
  text?: string
  toolInvocation?: ToolInvocationPart
}

export interface ToolInvocationPart {
  toolCallId: string
  toolName: string
  args?: Record<string, any>
  state: string
  result?: any
  error?: any
  isError?: boolean
}

export interface NestedToolRenderOptions {
  parentToolCallId: string
  showIndentation?: boolean
  maxDepth?: number
}
