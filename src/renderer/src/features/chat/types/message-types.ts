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
  toolCallId?: string
  toolName?: string
  input?: unknown
  output?: unknown
  errorText?: string
  state?: string
  approval?: { id: string; approved?: boolean; reason?: string }
  providerExecuted?: boolean
}

export interface ToolInvocationPart {
  toolCallId: string
  toolName: string
  args?: Record<string, UnsafeAny>
  state: string
  result?: UnsafeAny
  error?: UnsafeAny
  isError?: boolean
}

export interface NestedToolRenderOptions {
  parentToolCallId: string
  showIndentation?: boolean
  maxDepth?: number
}
