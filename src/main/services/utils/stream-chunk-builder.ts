interface ChunkPayload {
  prefix: string
  payload: any
}

export function buildToolStreamChunk(part: any): ChunkPayload | null {
  switch (part.type) {
    case 'tool-call': {
      const toolCallCompat = {
        type: 'tool-call',
        toolCallId: part.toolCallId ?? part.id ?? `tool_${Date.now()}`,
        toolName: part.toolName ?? part.name ?? part.tool?.name ?? '',
        args: part.input ?? part.args ?? part.arguments ?? {}
      }
      return { prefix: '9', payload: toolCallCompat }
    }
    case 'tool-result': {
      const toolResultCompat = {
        type: 'tool-result',
        toolCallId: part.toolCallId ?? part.id ?? `tool_${Date.now()}`,
        toolName: part.toolName ?? part.name ?? part.tool?.name ?? '',
        result: part.output ?? part.result
      }
      return { prefix: 'a', payload: toolResultCompat }
    }
    case 'tool-error': {
      const errorMessage =
        typeof part.error === 'string' ? part.error : part.error?.message || 'Tool execution failed.'
      const toolErrorCompat = {
        type: 'tool-result',
        toolCallId: part.toolCallId ?? part.id ?? `tool_${Date.now()}`,
        toolName: part.toolName ?? part.name ?? part.tool?.name ?? '',
        result: {
          status: 'error',
          message: errorMessage
        },
        isError: true
      }
      return { prefix: 'a', payload: toolErrorCompat }
    }
    case 'tool-call-streaming-start':
      return { prefix: 'b', payload: part }
    case 'tool-call-delta':
      return { prefix: 'c', payload: part }
    default:
      return null
  }
}
