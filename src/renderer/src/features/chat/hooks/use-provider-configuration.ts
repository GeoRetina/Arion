import { useMemo, useEffect } from 'react'
import { useLLMStore } from '@/stores/llm-store'
import {
  SUPPORTED_LLM_PROVIDERS,
  getFormattedProviderName,
  FormattableProviderConfig
} from '@/constants/llm-providers'
import type { LLMProviderType } from '../../../../../shared/ipc-types'
import {
  getModelReasoningCapabilities,
  type ModelReasoningCapabilities,
  type ReasoningCapabilityOverride
} from '../../../../../shared/utils/model-capabilities'

export const useProviderConfiguration = (
  stableChatIdForUseChat: string | null
): {
  availableProvidersForInput: {
    id: NonNullable<LLMProviderType>
    name: string
    isConfigured: boolean
    isActive: boolean
    modelId: string | null
    reasoningCapabilities: ModelReasoningCapabilities
  }[]
  activeProvider: LLMProviderType | null
  setActiveProvider: (provider: LLMProviderType | null) => void
  isConfigured: (provider: NonNullable<LLMProviderType>) => boolean
} => {
  const {
    openaiConfig,
    googleConfig,
    azureConfig,
    anthropicConfig,
    vertexConfig,
    ollamaConfig,
    isConfigured,
    activeProvider,
    setActiveProvider,
    isInitialized,
    initializeStore
  } = useLLMStore()

  // Initialize LLM store if not already
  useEffect(() => {
    if (!isInitialized) {
      initializeStore()
    }
  }, [isInitialized, initializeStore, stableChatIdForUseChat])

  // Prepare provider options for ChatInputBox dynamically
  const availableProvidersForInput = useMemo(() => {
    return SUPPORTED_LLM_PROVIDERS.map((providerId) => {
      const configured = isConfigured(providerId)
      const active = activeProvider === providerId
      let providerConfig: FormattableProviderConfig | undefined = undefined
      let reasoningCapabilityOverride: ReasoningCapabilityOverride | undefined

      // Get the correct config for the provider
      switch (providerId) {
        case 'openai':
          providerConfig = openaiConfig
          break
        case 'google':
          providerConfig = googleConfig
          break
        case 'azure':
          providerConfig = azureConfig
          reasoningCapabilityOverride = azureConfig.reasoningCapabilityOverride ?? undefined
          break
        case 'anthropic':
          providerConfig = anthropicConfig
          break
        case 'vertex':
          providerConfig = vertexConfig
          break
        case 'ollama':
          providerConfig = ollamaConfig
          break
      }

      const name = getFormattedProviderName(providerId, providerConfig, configured)
      const modelId =
        providerId === 'azure'
          ? (providerConfig?.deploymentName ?? null)
          : (providerConfig?.model ?? null)

      return {
        id: providerId,
        name,
        isConfigured: configured,
        isActive: active,
        modelId,
        reasoningCapabilities: getModelReasoningCapabilities(
          providerId,
          modelId ?? undefined,
          reasoningCapabilityOverride
        )
      }
    })
  }, [
    isConfigured,
    activeProvider,
    openaiConfig,
    googleConfig,
    azureConfig,
    anthropicConfig,
    vertexConfig,
    ollamaConfig
  ])

  return {
    availableProvidersForInput,
    activeProvider,
    setActiveProvider,
    isConfigured
  }
}
