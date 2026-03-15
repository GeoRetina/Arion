/**
 * Utility for detecting reasoning models and handling provider-specific compatibility
 */

export { extractReasoningFromText } from '../../shared/utils/reasoning-text'
import {
  getModelReasoningCapabilities,
  type ReasoningCapabilityOverride
} from '../../shared/utils/model-capabilities'

export interface ReasoningModelInfo {
  isReasoningModel: boolean
  shouldDisableTools: boolean
  modelId?: string
  providerId?: string
}

/**
 * Detects if a model is likely a reasoning model based on its ID
 */
export function detectReasoningModel(
  modelId: string | undefined,
  providerId?: string | undefined,
  reasoningCapabilityOverride?: ReasoningCapabilityOverride | null
): boolean {
  return getModelReasoningCapabilities(providerId, modelId, reasoningCapabilityOverride)
    .isReasoningModel
}

/**
 * Determines if tools should be disabled for a reasoning model based on provider
 */
export function shouldDisableToolsForReasoningModel(
  modelId: string | undefined,
  providerId: string | undefined,
  reasoningCapabilityOverride?: ReasoningCapabilityOverride | null
): ReasoningModelInfo {
  const isReasoningModel = detectReasoningModel(modelId, providerId, reasoningCapabilityOverride)

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
