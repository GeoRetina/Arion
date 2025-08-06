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
    'gpt-oss',
    'o1', 'o1-mini', 'o1-preview', 'o3', 'o3-mini',
    'reasoning', 'think', 'thought', 'chain-of-thought', 'cot',
    'qwen-qwq', 'deepseek-r1', 'marco-o1'
  ]
  
  return reasoningModelPatterns.some(pattern => modelLower.includes(pattern))
}

/**
 * Determines if tools should be disabled for a reasoning model based on provider
 */
export function shouldDisableToolsForReasoningModel(
  modelId: string | undefined,
  providerId: string | undefined
): ReasoningModelInfo {
  const isReasoningModel = detectReasoningModel(modelId)
  
  if (!isReasoningModel) {
    return { isReasoningModel: false, shouldDisableTools: false }
  }
  
  // Only disable tools for Ollama reasoning models due to schema conversion issues
  const shouldDisableTools = providerId?.toLowerCase().includes('ollama') ?? false
  
  return {
    isReasoningModel: true,
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
  return schemaErrorPatterns.some(pattern => messageLower.includes(pattern.toLowerCase()))
}

/**
 * Extract reasoning content from text using common patterns
 */
export function extractReasoningFromText(text: string): { content: string; reasoning?: string } {
  // Check for XML-like thinking tags
  const thinkingTagRegex = /<think>([\s\S]*?)<\/think>/i
  const match = text.match(thinkingTagRegex)
  
  if (match) {
    const reasoning = match[1].trim()
    const content = text.replace(thinkingTagRegex, '').trim()
    return { content, reasoning }
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
      return { content, reasoning }
    }
  }
  
  return { content: text }
}