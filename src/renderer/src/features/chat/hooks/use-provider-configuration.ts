import { useMemo, useEffect } from 'react'
import { useLLMStore } from '@/stores/llm-store'
import {
  SUPPORTED_LLM_PROVIDERS,
  getFormattedProviderName,
  FormattableProviderConfig
} from '@/constants/llm-providers'

export const useProviderConfiguration = (stableChatIdForUseChat: string | null) => {
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

      return {
        id: providerId,
        name,
        isConfigured: configured,
        isActive: active
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
