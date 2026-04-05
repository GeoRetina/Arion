const ANSI_ESCAPE_CHAR = String.fromCharCode(27)
const ANSI_ESCAPE_REGEX = new RegExp(`${ANSI_ESCAPE_CHAR}\\[[0-9;]*m`, 'g')

const GENERIC_MCP_ERROR_PATTERNS = [
  /^connection closed\.?$/i,
  /^server closed the connection\.?$/i,
  /^transport closed\.?$/i,
  /^failed to connect to mcp server\.?$/i
]

export const DEFAULT_MCP_RUNTIME_DETAIL_LIMIT = 12_000

export interface McpRuntimeFailure {
  message: string
  detail?: string
}

export function appendMcpRuntimeDetail(
  current: string | undefined,
  chunk: string,
  maxChars = DEFAULT_MCP_RUNTIME_DETAIL_LIMIT
): string | undefined {
  const normalizedChunk = chunk.replaceAll(ANSI_ESCAPE_REGEX, '')
  if (!normalizedChunk) {
    return normalizeMcpRuntimeDetail(current)
  }

  const next = `${current ?? ''}${normalizedChunk}`
  if (next.length <= maxChars) {
    return next
  }

  return next.slice(next.length - maxChars)
}

export function normalizeMcpRuntimeDetail(detail: string | undefined): string | undefined {
  if (!detail) {
    return undefined
  }

  const normalized = detail
    .replaceAll(ANSI_ESCAPE_REGEX, '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .join('\n')
    .trim()

  return normalized.length > 0 ? normalized : undefined
}

function getLastMeaningfulDetailLine(detail: string | undefined): string | undefined {
  if (!detail) {
    return undefined
  }

  const lines = detail
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  return lines.length > 0 ? lines[lines.length - 1] : undefined
}

function isGenericMcpErrorMessage(message: string): boolean {
  return GENERIC_MCP_ERROR_PATTERNS.some((pattern) => pattern.test(message))
}

export function summarizeMcpRuntimeFailure(
  error: unknown,
  detail?: string,
  fallbackMessage = 'Failed to connect to MCP server.'
): McpRuntimeFailure {
  const normalizedDetail = normalizeMcpRuntimeDetail(detail)
  const rawMessage =
    error instanceof Error && error.message.trim().length > 0
      ? error.message.trim()
      : fallbackMessage
  const detailSummary = getLastMeaningfulDetailLine(normalizedDetail)

  const message = detailSummary && isGenericMcpErrorMessage(rawMessage) ? detailSummary : rawMessage

  return {
    message,
    detail: normalizedDetail
  }
}
