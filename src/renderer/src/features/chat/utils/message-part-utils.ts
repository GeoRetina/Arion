import { splitReasoningText } from '../../../../../shared/utils/reasoning-text'
import {
  COMPONENT_TYPES,
  TOOL_PART_PREFIX,
  TOOL_STATES,
  TOOL_STATUS,
  type ToolStatus
} from '../constants/message-constants'
import type { ToolInvocation } from './tool-ui-component-detection'

/**
 * Checks if a message part represents a tool invocation
 */
export function isToolPart(part: any): boolean {
  return (
    part &&
    typeof part.type === 'string' &&
    (part.type === COMPONENT_TYPES.TOOL_INVOCATION ||
      part.type === 'dynamic-tool' ||
      part.type.startsWith(TOOL_PART_PREFIX))
  )
}

/**
 * Determines if an assistant message has any renderable content
 * (text, reasoning, or tool invocations)
 */
export function hasRenderableAssistantContent(message: any): boolean {
  if (!message || message.role !== 'assistant') return false

  const parts = Array.isArray(message.parts) ? message.parts : []
  if (parts.length === 0) {
    return typeof message.content === 'string' && message.content.trim().length > 0
  }

  return parts.some((part) => {
    if (!part || typeof part !== 'object') return false
    if (isToolPart(part)) return true
    if (part.type === COMPONENT_TYPES.TEXT && typeof part.text === 'string') {
      const { reasoningText, contentText } = splitReasoningText(part.text)
      if (reasoningText !== undefined) {
        return reasoningText.trim().length > 0 || contentText.trim().length > 0
      }
      return part.text.trim().length > 0
    }
    if (part.type === COMPONENT_TYPES.REASONING && typeof part.text === 'string') {
      return part.text.trim().length > 0
    }
    if (typeof (part as any).text === 'string') {
      return (part as any).text.trim().length > 0
    }
    return false
  })
}

/**
 * Determines the status of a tool invocation based on its state and error flags
 */
export function determineToolStatus(toolInvocation: ToolInvocation): ToolStatus {
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
 * Checks if a part is a tool UI part (dynamic-tool or prefixed tool type)
 */
export function isToolUIPart(part: any): boolean {
  return (
    part &&
    typeof part.type === 'string' &&
    (part.type === 'dynamic-tool' ||
      (part.type.startsWith(TOOL_PART_PREFIX) && part.type !== COMPONENT_TYPES.TOOL_INVOCATION))
  )
}

/**
 * Maps tool invocation state strings to standardized tool states
 */
export function mapToolInvocationState(state?: string): string {
  switch (state) {
    case 'output-available':
      return TOOL_STATES.RESULT
    case 'output-error':
    case 'output-denied':
      return TOOL_STATES.ERROR
    case 'input-streaming':
      return TOOL_STATES.PARTIAL_CALL
    case 'input-available':
    case 'approval-requested':
    case 'approval-responded':
      return TOOL_STATES.CALL
    default:
      return TOOL_STATES.CALL
  }
}

/**
 * Normalizes a message part into a ToolInvocation object if it represents a tool call
 */
export function normalizeToolInvocationPart(part: any): ToolInvocation | null {
  if (!part || typeof part !== 'object') {
    return null
  }

  if (part.type === COMPONENT_TYPES.TOOL_INVOCATION && part.toolInvocation) {
    return part.toolInvocation as ToolInvocation
  }

  if (!isToolUIPart(part)) {
    return null
  }

  const toolName =
    part.type === 'dynamic-tool' ? part.toolName : part.type.slice(TOOL_PART_PREFIX.length)
  const toolCallId = part.toolCallId ?? part.id
  if (!toolName || !toolCallId) {
    return null
  }

  const errorText =
    part.errorText ??
    (part.approval && part.approval.approved === false
      ? part.approval.reason || 'Tool approval denied.'
      : undefined)

  return {
    toolCallId,
    toolName,
    args: part.input ?? part.rawInput ?? {},
    state: mapToolInvocationState(part.state),
    result: part.output,
    error: errorText,
    isError: Boolean(errorText) || part.state === 'output-error' || part.state === 'output-denied'
  }
}
