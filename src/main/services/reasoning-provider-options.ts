/**
 * Centralized provider-specific reasoning options
 */

import {
  getThinkingBudgetForPreset,
  getModelReasoningCapabilities,
  resolveReasoningBudgetPreset,
  resolveReasoningEffort,
  type ReasoningCapabilityOverride,
  type ReasoningBudgetPreset,
  type ReasoningEffort
} from '../../shared/utils/model-capabilities'

export interface ProviderReasoningConfig {
  providerId?: string
  modelId?: string
  reasoningEffort?: ReasoningEffort
  reasoningBudgetPreset?: ReasoningBudgetPreset
  reasoningCapabilityOverride?: ReasoningCapabilityOverride | null
}

type ProviderOptionsContainer = {
  providerOptions?: Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function omitKeys(record: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const nextRecord = { ...record }

  for (const key of keys) {
    delete nextRecord[key]
  }

  return nextRecord
}

/**
 * Applies provider-specific reasoning options into streamText options.
 * Mutates and returns the provided options object to simplify call sites.
 */
export function applyReasoningProviderOptions<T extends Record<string, unknown>>(
  config: ProviderReasoningConfig,
  streamTextOptions: T
): T {
  const optionsWithProvider = streamTextOptions as T & ProviderOptionsContainer
  const capabilities = getModelReasoningCapabilities(
    config.providerId,
    config.modelId,
    config.reasoningCapabilityOverride
  )

  if (!capabilities.isReasoningModel || !config.providerId) {
    return streamTextOptions
  }

  const resolvedReasoningEffort = resolveReasoningEffort(capabilities, config.reasoningEffort)
  const resolvedReasoningBudgetPreset = resolveReasoningBudgetPreset(
    capabilities,
    config.reasoningBudgetPreset
  )
  const current = asRecord(optionsWithProvider.providerOptions) ?? {}

  if (config.providerId === 'google') {
    const currentProvider = asRecord(current[config.providerId]) ?? {}
    const currentThinkingConfig = asRecord(currentProvider.thinkingConfig) ?? {}
    const sanitizedThinkingConfig = omitKeys(currentThinkingConfig, [
      'thinkingBudget',
      'thinkingLevel'
    ])
    const currentThinkingBudget =
      typeof currentThinkingConfig.thinkingBudget === 'number'
        ? currentThinkingConfig.thinkingBudget
        : undefined
    const mappedThinkingBudget =
      resolvedReasoningBudgetPreset &&
      getThinkingBudgetForPreset(config.providerId, config.modelId, resolvedReasoningBudgetPreset)
    optionsWithProvider.providerOptions = {
      ...current,
      [config.providerId]: {
        ...currentProvider,
        thinkingConfig: {
          ...sanitizedThinkingConfig,
          includeThoughts: true,
          ...(capabilities.supportsReasoningEffort && resolvedReasoningEffort
            ? { thinkingLevel: resolvedReasoningEffort }
            : capabilities.supportsReasoningBudgetPresets && resolvedReasoningBudgetPreset
              ? {
                  thinkingBudget:
                    config.reasoningBudgetPreset != null
                      ? (mappedThinkingBudget ?? currentThinkingBudget ?? -1)
                      : (currentThinkingBudget ?? mappedThinkingBudget ?? -1)
                }
              : { thinkingBudget: currentThinkingBudget ?? 1024 })
        }
      }
    }
  } else if (config.providerId === 'vertex') {
    const currentProvider = asRecord(current[config.providerId]) ?? {}
    const currentThinkingConfig = asRecord(currentProvider.thinkingConfig) ?? {}
    const sanitizedThinkingConfig = omitKeys(currentThinkingConfig, ['thinkingLevel'])
    const currentThinkingBudget =
      typeof currentThinkingConfig.thinkingBudget === 'number'
        ? currentThinkingConfig.thinkingBudget
        : undefined
    optionsWithProvider.providerOptions = {
      ...current,
      vertex: {
        ...currentProvider,
        thinkingConfig: {
          ...sanitizedThinkingConfig,
          includeThoughts: true,
          thinkingBudget: currentThinkingBudget ?? 1024
        }
      }
    }
  }

  if (
    (config.providerId === 'openai' || config.providerId === 'azure') &&
    capabilities.supportsReasoningEffort &&
    resolvedReasoningEffort
  ) {
    const currentProvider = asRecord(current[config.providerId]) ?? {}
    optionsWithProvider.providerOptions = {
      ...current,
      [config.providerId]: {
        ...currentProvider,
        reasoningEffort: resolvedReasoningEffort,
        reasoningSummary: 'auto'
      }
    }
  }

  return streamTextOptions
}
