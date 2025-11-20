/**
 * Utility for detecting reasoning models and handling provider-specific compatibility
 */

export interface ReasoningModelInfo {
  isReasoningModel: boolean
  shouldDisableTools: boolean
  modelId?: string
  providerId?: string
}

/**
 * Detects if a model is likely a reasoning model based on its ID
 */
export function detectReasoningModel(modelId: string | undefined): boolean {
  if (!modelId) return false

  const modelLower = modelId.toLowerCase()
  const reasoningModelPatterns = [
    'reasoning',
    'think',
    'thought',
    'chain-of-thought',
    'cot',
    'reflection'
  ]

  return reasoningModelPatterns.some((pattern) => modelLower.includes(pattern))
}

/**
 * Determines if tools should be disabled for a reasoning model based on provider
 */
export function shouldDisableToolsForReasoningModel(
  modelId: string | undefined,
  providerId: string | undefined
): ReasoningModelInfo {
  const isReasoningModel = detectReasoningModel(modelId)

  // Tools are enabled for all providers including Ollama
  // User confirmed their model supports tool calling
  const shouldDisableTools = false

  return {
    isReasoningModel,
    shouldDisableTools,
    modelId,
    providerId
  }
}

/**
 * Check if an error indicates tool schema compatibility issues
 */
export function isToolSchemaError(errorMessage: string): boolean {
  const schemaErrorPatterns = [
    'template:',
    'executing',
    'slice index out of range',
    'error calling index',
    'reflect:',
    'failed to parse stream string',
    'no separator found'
  ]

  const messageLower = errorMessage.toLowerCase()
  return schemaErrorPatterns.some((pattern) => messageLower.includes(pattern.toLowerCase()))
}

/**
 * Extract reasoning content from text using common patterns
 */
export function extractReasoningFromText(text: string): {
  content: string
  reasoningText?: string
} {
  // Check for XML-like thinking tags
  const thinkingTagRegex = /<think>([\s\S]*?)<\/think>/i
  const match = text.match(thinkingTagRegex)

  if (match) {
    const reasoning = match[1].trim()
    const content = text.replace(thinkingTagRegex, '').trim()
    return { content, reasoningText: reasoning }
  }

  // Check for other common reasoning delimiters
  const reasoningPatterns = [
    /^Thinking:([\s\S]*?)(?:\n\n|$)/i,
    /^Reasoning:([\s\S]*?)(?:\n\n|$)/i,
    /^\*\*Thinking:\*\*([\s\S]*?)(?:\n\n|$)/i
  ]

  for (const pattern of reasoningPatterns) {
    const match = text.match(pattern)
    if (match) {
      const reasoning = match[1].trim()
      const content = text.replace(pattern, '').trim()
      return { content, reasoningText: reasoning }
    }
  }

  return { content: text }
}
