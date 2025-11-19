import { type ModelMessage } from 'ai'

/**
 * Convert renderer message parts (especially tool invocations) into the format
 * expected by convertToModelMessages.
 */
export function normalizeRendererMessages(rendererMessages: Array<any>): Array<any> {
  if (!Array.isArray(rendererMessages)) {
    return []
  }

  return rendererMessages.map((message, messageIndex) => {
    if (!message || typeof message !== 'object' || !Array.isArray((message as any).parts)) {
      return message
    }

    let mutated = false
    const normalizedParts = (message as any).parts.map((part: any, partIndex: number) => {
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
        return (
          !part ||
          typeof part !== 'object' ||
          typeof (part as any).toolCallId !== 'string' ||
          typeof (part as any).toolName !== 'string' ||
          (part as any).output === undefined
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

function normalizeToolInvocationPart(part: any, messageIndex: number, partIndex: number) {
  if (!part || typeof part !== 'object') {
    return part
  }

  if (part.type !== 'tool-invocation') {
    return part
  }

  const invocationPayload = part.toolInvocation || part
  if (!invocationPayload || typeof invocationPayload !== 'object') {
    return part
  }

  const toolName = normalizeToolName(invocationPayload.toolName || invocationPayload.tool)
  const normalizedState = mapToolInvocationState(invocationPayload.state)

  const providerExecutedFlag =
    typeof invocationPayload.providerExecuted === 'boolean'
      ? invocationPayload.providerExecuted
      : false

  const normalizedPart: any = {
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
    normalizedPart.errorText =
      typeof invocationPayload.error === 'string'
        ? invocationPayload.error
        : invocationPayload.error?.message || 'Tool execution failed.'
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

function mapToolInvocationState(state?: string) {
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

function normalizeToolName(toolName?: string) {
  if (!toolName || typeof toolName !== 'string') {
    return 'unknown-tool'
  }
  return toolName.trim().replace(/\s+/g, '_')
}
