import { type ModelMessage } from 'ai'

/**
 * Convert renderer message parts (especially tool invocations) into the format
 * expected by convertToModelMessages.
 */
export function normalizeRendererMessages(rendererMessages: unknown[]): unknown[] {
  if (!Array.isArray(rendererMessages)) {
    return []
  }

  return rendererMessages.map((message, messageIndex) => {
    if (!message || typeof message !== 'object') {
      return message
    }

    const messageRecord = message as { parts?: unknown[] }
    if (!Array.isArray(messageRecord.parts)) {
      return message
    }

    let mutated = false
    const normalizedParts = messageRecord.parts.map((part, partIndex: number) => {
      const normalizedPart = normalizeToolInvocationPart(part, messageIndex, partIndex)
      if (normalizedPart !== part) {
        mutated = true
      }
      return normalizedPart
    })

    return mutated ? { ...message, parts: normalizedParts } : message
  })
}

/**
 * Remove invalid tool/assistant messages that would fail validation in providers.
 */
export function sanitizeModelMessages(messages: ModelMessage[]): ModelMessage[] {
  if (!Array.isArray(messages)) {
    return []
  }

  const sanitized: ModelMessage[] = []

  messages.forEach((message) => {
    if (message.role === 'tool') {
      const contentArray = Array.isArray(message.content) ? message.content : []

      if (contentArray.length === 0) {
        return
      }

      const invalidPart = contentArray.find((part) => {
        const candidate = part as {
          toolCallId?: unknown
          toolName?: unknown
          output?: unknown
        }
        return (
          !part ||
          typeof part !== 'object' ||
          typeof candidate.toolCallId !== 'string' ||
          typeof candidate.toolName !== 'string' ||
          candidate.output === undefined
        )
      })

      if (invalidPart) {
        return
      }
    }

    if (message.role === 'assistant' && Array.isArray(message.content)) {
      if (message.content.length === 0) {
        return
      }
    }

    sanitized.push(message)
  })

  return sanitized
}

function normalizeToolInvocationPart(
  part: unknown,
  messageIndex: number,
  partIndex: number
): unknown {
  if (!part || typeof part !== 'object') {
    return part
  }

  const partRecord = part as Record<string, unknown>
  if (partRecord.type !== 'tool-invocation') {
    return part
  }

  const invocationPayload =
    (partRecord.toolInvocation as Record<string, unknown> | undefined) ?? partRecord
  if (!invocationPayload || typeof invocationPayload !== 'object') {
    return part
  }

  const toolName = normalizeToolName(
    (invocationPayload.toolName as string | undefined) ??
      (invocationPayload.tool as string | undefined)
  )
  const normalizedState = mapToolInvocationState(invocationPayload.state as string | undefined)

  const providerExecutedFlag =
    typeof invocationPayload.providerExecuted === 'boolean'
      ? invocationPayload.providerExecuted
      : false

  const normalizedPart: Record<string, unknown> = {
    type: `tool-${toolName}`,
    toolCallId:
      invocationPayload.toolCallId ||
      invocationPayload.id ||
      `tool_${messageIndex}_${partIndex}_${Date.now()}`,
    state: normalizedState,
    input: invocationPayload.args ?? invocationPayload.input,
    providerExecuted: providerExecutedFlag
  }

  if (invocationPayload.providerMetadata) {
    normalizedPart.callProviderMetadata = invocationPayload.providerMetadata
  }

  if (normalizedState === 'output-available' && invocationPayload.result !== undefined) {
    normalizedPart.output = invocationPayload.result
  }

  if (normalizedState === 'output-error') {
    const invocationError = invocationPayload.error
    normalizedPart.errorText =
      typeof invocationError === 'string'
        ? invocationError
        : invocationError && typeof invocationError === 'object' && 'message' in invocationError
          ? (invocationError.message as string)
          : 'Tool execution failed.'
    normalizedPart.rawInput =
      invocationPayload.rawInput ?? invocationPayload.args ?? invocationPayload.input ?? null
  }

  if (
    invocationPayload.result &&
    typeof invocationPayload.result === 'object' &&
    'preliminary' in invocationPayload.result
  ) {
    normalizedPart.preliminary = Boolean(invocationPayload.result.preliminary)
  }
  return normalizedPart
}

function mapToolInvocationState(
  state?: string
): 'output-available' | 'output-error' | 'input-available' {
  switch (state) {
    case 'result':
      return 'output-available'
    case 'error':
      return 'output-error'
    case 'loading':
    case 'call':
    case 'partial-call':
    case 'input':
      return 'input-available'
    default:
      return 'input-available'
  }
}

function normalizeToolName(toolName?: string): string {
  if (!toolName || typeof toolName !== 'string') {
    return 'unknown-tool'
  }
  return toolName.trim().replace(/\s+/g, '_')
}
