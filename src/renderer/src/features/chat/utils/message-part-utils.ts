import { splitReasoningText } from '../../../../../shared/utils/reasoning-text'
import {
  COMPONENT_TYPES,
  TOOL_PART_PREFIX,
  TOOL_STATES,
  TOOL_STATUS,
  type ToolStatus
} from '../constants/message-constants'
import type { ToolInvocation } from './tool-ui-component-detection'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

/**
 * Checks if a message part represents a tool invocation
 */
export function isToolPart(part: unknown): boolean {
  const partRecord = asRecord(part)
  return Boolean(
    partRecord &&
    typeof partRecord.type === 'string' &&
    (partRecord.type === COMPONENT_TYPES.TOOL_INVOCATION ||
      partRecord.type === 'dynamic-tool' ||
      partRecord.type.startsWith(TOOL_PART_PREFIX))
  )
}

/**
 * Determines if an assistant message has any renderable content
 * (text, reasoning, or tool invocations)
 */
export function hasRenderableAssistantContent(message: unknown): boolean {
  const messageRecord = asRecord(message)
  if (!messageRecord || messageRecord.role !== 'assistant') return false

  const parts = Array.isArray(messageRecord.parts) ? messageRecord.parts : []
  if (parts.length === 0) {
    return typeof messageRecord.content === 'string' && messageRecord.content.trim().length > 0
  }

  return parts.some((part) => {
    const partRecord = asRecord(part)
    if (!partRecord) return false
    if (isToolPart(partRecord)) return true
    if (partRecord.type === COMPONENT_TYPES.TEXT && typeof partRecord.text === 'string') {
      const { reasoningText, contentText } = splitReasoningText(partRecord.text)
      if (reasoningText !== undefined) {
        return reasoningText.trim().length > 0 || contentText.trim().length > 0
      }
      return partRecord.text.trim().length > 0
    }
    if (partRecord.type === COMPONENT_TYPES.REASONING && typeof partRecord.text === 'string') {
      return partRecord.text.trim().length > 0
    }
    if (typeof partRecord.text === 'string') {
      return partRecord.text.trim().length > 0
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
        Boolean((toolInvocation.result as { isError?: unknown }).isError))
    return isError ? TOOL_STATUS.ERROR : TOOL_STATUS.COMPLETED
  }

  return TOOL_STATUS.LOADING
}

/**
 * Checks if a part is a tool UI part (dynamic-tool or prefixed tool type)
 */
export function isToolUIPart(part: unknown): boolean {
  const partRecord = asRecord(part)
  return Boolean(
    partRecord &&
    typeof partRecord.type === 'string' &&
    (partRecord.type === 'dynamic-tool' ||
      (partRecord.type.startsWith(TOOL_PART_PREFIX) &&
        partRecord.type !== COMPONENT_TYPES.TOOL_INVOCATION))
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
export function normalizeToolInvocationPart(part: unknown): ToolInvocation | null {
  const partRecord = asRecord(part)
  if (!partRecord) {
    return null
  }

  if (partRecord.type === COMPONENT_TYPES.TOOL_INVOCATION && partRecord.toolInvocation) {
    return partRecord.toolInvocation as ToolInvocation
  }

  if (!isToolUIPart(partRecord)) {
    return null
  }

  const toolName =
    partRecord.type === 'dynamic-tool'
      ? (partRecord.toolName as string | undefined)
      : (partRecord.type as string).slice(TOOL_PART_PREFIX.length)
  const toolCallId = (partRecord.toolCallId ?? partRecord.id) as string | undefined
  if (!toolName || !toolCallId) {
    return null
  }

  const approvalRecord = asRecord(partRecord.approval)
  const approvalDenied = approvalRecord?.approved === false
  const errorText =
    (partRecord.errorText as string | undefined) ??
    (approvalDenied
      ? (approvalRecord?.reason as string | undefined) || 'Tool approval denied.'
      : undefined)

  return {
    toolCallId,
    toolName,
    args:
      partRecord.input && typeof partRecord.input === 'object'
        ? (partRecord.input as Record<string, unknown>)
        : partRecord.rawInput && typeof partRecord.rawInput === 'object'
          ? (partRecord.rawInput as Record<string, unknown>)
          : {},
    state: mapToolInvocationState(partRecord.state as string | undefined),
    result: partRecord.output,
    error: errorText,
    isError:
      Boolean(errorText) ||
      partRecord.state === 'output-error' ||
      partRecord.state === 'output-denied'
  }
}
