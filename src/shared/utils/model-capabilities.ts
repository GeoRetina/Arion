export const REASONING_EFFORT_VALUES = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh'
] as const
export const REASONING_BUDGET_PRESET_VALUES = ['auto', 'low', 'medium', 'high'] as const

export type ReasoningEffort = (typeof REASONING_EFFORT_VALUES)[number]
export type ReasoningBudgetPreset = (typeof REASONING_BUDGET_PRESET_VALUES)[number]
export const REASONING_CAPABILITY_OVERRIDE_VALUES = ['auto', 'reasoning', 'standard'] as const

export type ReasoningCapabilityOverride = (typeof REASONING_CAPABILITY_OVERRIDE_VALUES)[number]
export type ReasoningCapabilitySource = 'inferred' | 'manual'

export interface ModelReasoningCapabilities {
  isReasoningModel: boolean
  supportsReasoningEffort: boolean
  supportsReasoningBudgetPresets: boolean
  defaultReasoningEffort?: ReasoningEffort
  reasoningEffortValues?: readonly ReasoningEffort[]
  defaultReasoningBudgetPreset?: ReasoningBudgetPreset
  reasoningBudgetPresetValues?: readonly ReasoningBudgetPreset[]
  source: ReasoningCapabilitySource
}

const DEFAULT_REASONING_CAPABILITIES: ModelReasoningCapabilities = {
  isReasoningModel: false,
  supportsReasoningEffort: false,
  supportsReasoningBudgetPresets: false,
  source: 'inferred'
}

function normalizeId(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

export function normalizeReasoningCapabilityOverride(
  value: string | null | undefined
): ReasoningCapabilityOverride {
  const normalizedValue = normalizeId(value ?? undefined)

  switch (normalizedValue) {
    case 'reasoning':
    case 'standard':
      return normalizedValue
    default:
      return 'auto'
  }
}

function getOpenAIReasoningCapabilities(modelId: string): ModelReasoningCapabilities {
  const isReasoningModel =
    modelId.startsWith('o1') ||
    modelId.startsWith('o3') ||
    modelId.startsWith('o4-mini') ||
    modelId.startsWith('codex-mini') ||
    modelId.startsWith('computer-use-preview') ||
    (modelId.startsWith('gpt-5') && !modelId.startsWith('gpt-5-chat'))

  if (!isReasoningModel) {
    return DEFAULT_REASONING_CAPABILITIES
  }

  const gpt5MinorVersion = getGpt5MinorVersion(modelId)
  const isModernGpt5 = gpt5MinorVersion !== null && gpt5MinorVersion >= 2
  const isGpt51 = gpt5MinorVersion === 1
  const isGpt5Pro = modelId === 'gpt-5-pro'
  const isModernGpt5Pro = isModernGpt5 && modelId.includes('-pro')
  const isModernGpt5Codex = isModernGpt5 && modelId.includes('codex')

  if (isGpt5Pro) {
    return {
      isReasoningModel: true,
      supportsReasoningEffort: true,
      supportsReasoningBudgetPresets: false,
      defaultReasoningEffort: 'high',
      reasoningEffortValues: ['high'],
      source: 'inferred'
    }
  }

  if (isModernGpt5Pro) {
    return {
      isReasoningModel: true,
      supportsReasoningEffort: true,
      supportsReasoningBudgetPresets: false,
      defaultReasoningEffort: 'high',
      reasoningEffortValues: ['medium', 'high', 'xhigh'],
      source: 'inferred'
    }
  }

  if (isModernGpt5Codex) {
    return {
      isReasoningModel: true,
      supportsReasoningEffort: true,
      supportsReasoningBudgetPresets: false,
      defaultReasoningEffort: 'medium',
      reasoningEffortValues: ['low', 'medium', 'high', 'xhigh'],
      source: 'inferred'
    }
  }

  if (isModernGpt5) {
    return {
      isReasoningModel: true,
      supportsReasoningEffort: true,
      supportsReasoningBudgetPresets: false,
      defaultReasoningEffort: 'none',
      reasoningEffortValues: ['none', 'low', 'medium', 'high', 'xhigh'],
      source: 'inferred'
    }
  }

  if (isGpt51) {
    return {
      isReasoningModel: true,
      supportsReasoningEffort: true,
      supportsReasoningBudgetPresets: false,
      defaultReasoningEffort: 'none',
      reasoningEffortValues: ['none', 'low', 'medium', 'high'],
      source: 'inferred'
    }
  }

  if (
    modelId.startsWith('o1') ||
    modelId.startsWith('o3') ||
    modelId.startsWith('o4-mini') ||
    modelId.startsWith('codex-mini') ||
    modelId.startsWith('computer-use-preview')
  ) {
    return {
      isReasoningModel: true,
      supportsReasoningEffort: true,
      supportsReasoningBudgetPresets: false,
      defaultReasoningEffort: 'medium',
      reasoningEffortValues: ['low', 'medium', 'high'],
      source: 'inferred'
    }
  }

  return {
    isReasoningModel: true,
    supportsReasoningEffort: true,
    supportsReasoningBudgetPresets: false,
    defaultReasoningEffort: 'medium',
    reasoningEffortValues: ['minimal', 'low', 'medium', 'high'],
    source: 'inferred'
  }
}

function getGoogleReasoningCapabilities(modelId: string): ModelReasoningCapabilities {
  const supportsReasoningEffort = modelId.startsWith('gemini-3')
  const supportsReasoningBudgetPresets = modelId.startsWith('gemini-2.5')
  const isReasoningModel =
    supportsReasoningEffort || supportsReasoningBudgetPresets || modelId.includes('thinking')

  if (!isReasoningModel) {
    return DEFAULT_REASONING_CAPABILITIES
  }

  return {
    isReasoningModel: true,
    supportsReasoningEffort,
    supportsReasoningBudgetPresets,
    ...(supportsReasoningEffort
      ? {
          defaultReasoningEffort: 'medium' as const,
          reasoningEffortValues: ['minimal', 'low', 'medium', 'high'] as const
        }
      : {}),
    ...(supportsReasoningBudgetPresets
      ? {
          defaultReasoningBudgetPreset: 'auto' as const,
          reasoningBudgetPresetValues: REASONING_BUDGET_PRESET_VALUES
        }
      : {}),
    source: 'inferred'
  }
}

function getVertexReasoningCapabilities(modelId: string): ModelReasoningCapabilities {
  const isReasoningModel =
    modelId.startsWith('gemini-2.5') ||
    modelId.startsWith('gemini-3') ||
    modelId.includes('thinking')

  if (!isReasoningModel) {
    return DEFAULT_REASONING_CAPABILITIES
  }

  return {
    isReasoningModel: true,
    supportsReasoningEffort: false,
    supportsReasoningBudgetPresets: false,
    source: 'inferred'
  }
}

function getAnthropicReasoningCapabilities(modelId: string): ModelReasoningCapabilities {
  const isReasoningModel =
    modelId.startsWith('claude-3-7') ||
    modelId.startsWith('claude-sonnet-4') ||
    modelId.startsWith('claude-opus-4') ||
    modelId.startsWith('claude-haiku-4')

  if (!isReasoningModel) {
    return DEFAULT_REASONING_CAPABILITIES
  }

  return {
    isReasoningModel: true,
    supportsReasoningEffort: false,
    supportsReasoningBudgetPresets: false,
    source: 'inferred'
  }
}

function getOllamaReasoningCapabilities(modelId: string): ModelReasoningCapabilities {
  const reasoningModelPatterns = ['reasoning', 'thinking', 'deepseek-r1', 'qwq', 'qwen3', 'r1']

  const isReasoningModel = reasoningModelPatterns.some((pattern) => modelId.includes(pattern))

  if (!isReasoningModel) {
    return DEFAULT_REASONING_CAPABILITIES
  }

  return {
    isReasoningModel: true,
    supportsReasoningEffort: false,
    supportsReasoningBudgetPresets: false,
    source: 'inferred'
  }
}

function getAzureReasoningCapabilities(
  modelId: string,
  override: ReasoningCapabilityOverride
): ModelReasoningCapabilities {
  if (override === 'reasoning') {
    return {
      isReasoningModel: true,
      supportsReasoningEffort: true,
      supportsReasoningBudgetPresets: false,
      defaultReasoningEffort: 'medium',
      reasoningEffortValues: ['low', 'medium', 'high'],
      source: 'manual'
    }
  }

  if (override === 'standard') {
    return {
      isReasoningModel: false,
      supportsReasoningEffort: false,
      supportsReasoningBudgetPresets: false,
      source: 'manual'
    }
  }

  return getOpenAIReasoningCapabilities(modelId)
}

function getGpt5MinorVersion(modelId: string): number | null {
  const match = modelId.match(/^gpt-5\.(\d+)(?:$|[-])/)
  if (!match) {
    return null
  }

  return Number.parseInt(match[1], 10)
}

export function getModelReasoningCapabilities(
  providerId: string | undefined,
  modelId: string | undefined,
  overrideValue?: ReasoningCapabilityOverride | null
): ModelReasoningCapabilities {
  const normalizedProviderId = normalizeId(providerId)
  const normalizedModelId = normalizeId(modelId)
  const normalizedOverride = normalizeReasoningCapabilityOverride(overrideValue)

  if (!normalizedProviderId || !normalizedModelId) {
    return DEFAULT_REASONING_CAPABILITIES
  }

  switch (normalizedProviderId) {
    case 'openai':
      return getOpenAIReasoningCapabilities(normalizedModelId)
    case 'azure':
      return getAzureReasoningCapabilities(normalizedModelId, normalizedOverride)
    case 'google':
      return getGoogleReasoningCapabilities(normalizedModelId)
    case 'vertex':
      return getVertexReasoningCapabilities(normalizedModelId)
    case 'anthropic':
      return getAnthropicReasoningCapabilities(normalizedModelId)
    case 'ollama':
      return getOllamaReasoningCapabilities(normalizedModelId)
    default:
      return DEFAULT_REASONING_CAPABILITIES
  }
}

export function resolveReasoningEffort(
  capabilities: ModelReasoningCapabilities,
  requestedEffort?: ReasoningEffort | null
): ReasoningEffort | undefined {
  if (!capabilities.supportsReasoningEffort) {
    return undefined
  }

  const supportedEfforts = capabilities.reasoningEffortValues ?? []

  if (requestedEffort && supportedEfforts.includes(requestedEffort)) {
    return requestedEffort
  }

  if (
    capabilities.defaultReasoningEffort &&
    supportedEfforts.includes(capabilities.defaultReasoningEffort)
  ) {
    return capabilities.defaultReasoningEffort
  }

  return supportedEfforts[0]
}

export function resolveReasoningBudgetPreset(
  capabilities: ModelReasoningCapabilities,
  requestedPreset?: ReasoningBudgetPreset | null
): ReasoningBudgetPreset | undefined {
  if (!capabilities.supportsReasoningBudgetPresets) {
    return undefined
  }

  const supportedPresets = capabilities.reasoningBudgetPresetValues ?? []

  if (requestedPreset && supportedPresets.includes(requestedPreset)) {
    return requestedPreset
  }

  if (
    capabilities.defaultReasoningBudgetPreset &&
    supportedPresets.includes(capabilities.defaultReasoningBudgetPreset)
  ) {
    return capabilities.defaultReasoningBudgetPreset
  }

  return supportedPresets[0]
}

export function getThinkingBudgetForPreset(
  providerId: string | undefined,
  modelId: string | undefined,
  preset: ReasoningBudgetPreset
): number | undefined {
  const normalizedProviderId = normalizeId(providerId)
  const normalizedModelId = normalizeId(modelId)

  if (normalizedProviderId !== 'google' || !normalizedModelId.startsWith('gemini-2.5')) {
    return undefined
  }

  if (preset === 'auto') {
    return -1
  }

  if (normalizedModelId.includes('flash-lite')) {
    switch (preset) {
      case 'low':
        return 512
      case 'medium':
        return 4096
      case 'high':
        return 16384
      default:
        return -1
    }
  }

  switch (preset) {
    case 'low':
      return 1024
    case 'medium':
      return 8192
    case 'high':
      return 24576
    default:
      return -1
  }
}
