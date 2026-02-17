interface ChunkPayload {
  prefix: string
  payload: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

export function buildToolStreamChunk(part: unknown): ChunkPayload | null {
  const partRecord = asRecord(part)
  if (!partRecord || typeof partRecord.type !== 'string') {
    return null
  }

  switch (partRecord.type) {
    case 'tool-call': {
      const toolRecord = asRecord(partRecord.tool)
      const toolCallCompat = {
        type: 'tool-call',
        toolCallId: partRecord.toolCallId ?? partRecord.id ?? `tool_${Date.now()}`,
        toolName: partRecord.toolName ?? partRecord.name ?? toolRecord?.name ?? '',
        args: partRecord.input ?? partRecord.args ?? partRecord.arguments ?? {}
      }
      return { prefix: '9', payload: toolCallCompat }
    }
    case 'tool-result': {
      const toolRecord = asRecord(partRecord.tool)
      const toolResultCompat = {
        type: 'tool-result',
        toolCallId: partRecord.toolCallId ?? partRecord.id ?? `tool_${Date.now()}`,
        toolName: partRecord.toolName ?? partRecord.name ?? toolRecord?.name ?? '',
        result: partRecord.output ?? partRecord.result
      }
      return { prefix: 'a', payload: toolResultCompat }
    }
    case 'tool-error': {
      const toolRecord = asRecord(partRecord.tool)
      const errorRecord = asRecord(partRecord.error)
      const errorMessage =
        typeof partRecord.error === 'string'
          ? partRecord.error
          : (typeof errorRecord?.message === 'string' ? errorRecord.message : null) ||
            'Tool execution failed.'
      const toolErrorCompat = {
        type: 'tool-result',
        toolCallId: partRecord.toolCallId ?? partRecord.id ?? `tool_${Date.now()}`,
        toolName: partRecord.toolName ?? partRecord.name ?? toolRecord?.name ?? '',
        result: {
          status: 'error',
          message: errorMessage
        },
        isError: true
      }
      return { prefix: 'a', payload: toolErrorCompat }
    }
    case 'tool-call-streaming-start':
      return { prefix: 'b', payload: partRecord }
    case 'tool-call-delta':
      return { prefix: 'c', payload: partRecord }
    default:
      return null
  }
}
