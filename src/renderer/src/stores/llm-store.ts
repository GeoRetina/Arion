import { create } from 'zustand'
import type {
  LLMProviderType as LLMProvider,
  VertexConfig,
  OllamaConfig,
  EmbeddingConfig
} from '../../../shared/ipc-types'
import {
  DEFAULT_EMBEDDING_MODEL_BY_PROVIDER,
  DEFAULT_EMBEDDING_PROVIDER
} from '../../../shared/embedding-constants'

export type { LLMProvider }

export interface LLMConfig {
  apiKey?: string | null
  model?: string | null
  endpoint?: string | null
  deploymentName?: string | null
  project?: string | null
  location?: string | null
  baseURL?: string | null
}

interface LLMStoreState {
  openaiConfig: LLMConfig
  googleConfig: LLMConfig
  azureConfig: LLMConfig
  anthropicConfig: LLMConfig
  vertexConfig: LLMConfig
  ollamaConfig: LLMConfig
  embeddingConfig: EmbeddingConfig
  activeProvider: LLMProvider | null
  isInitialized: boolean
  isConfigured: (provider: NonNullable<LLMProvider>) => boolean

  initializeStore: () => Promise<void>
  setActiveProvider: (provider: LLMProvider | null) => void
  setOpenAIConfig: (config: { apiKey: string; model: string }) => void
  setGoogleConfig: (config: { apiKey: string; model: string }) => void
  setAzureConfig: (config: { apiKey: string; endpoint: string; deploymentName: string }) => void
  setAnthropicConfig: (config: { apiKey: string; model: string }) => void
  setVertexConfig: (config: VertexConfig) => void
  setOllamaConfig: (config: OllamaConfig) => void
  setEmbeddingConfig: (config: EmbeddingConfig) => void
  clearProviderConfig: (provider: NonNullable<LLMProvider>) => void
}

const initialConfig: LLMConfig = {
  apiKey: null,
  model: null,
  endpoint: null,
  deploymentName: null,
  project: null,
  location: null,
  baseURL: null
}

const defaultEmbeddingConfig: EmbeddingConfig = {
  provider: DEFAULT_EMBEDDING_PROVIDER,
  model: DEFAULT_EMBEDDING_MODEL_BY_PROVIDER[DEFAULT_EMBEDDING_PROVIDER]
}

export const useLLMStore = create<LLMStoreState>((set, get) => ({
  openaiConfig: { ...initialConfig },
  googleConfig: { ...initialConfig },
  azureConfig: { ...initialConfig },
  anthropicConfig: { ...initialConfig },
  vertexConfig: { ...initialConfig },
  ollamaConfig: { ...initialConfig },
  embeddingConfig: { ...defaultEmbeddingConfig },
  activeProvider: null,
  isInitialized: false,

  isConfigured: (provider) => {
    const configKey = `${provider}Config` as keyof Pick<
      LLMStoreState,
      | 'openaiConfig'
      | 'googleConfig'
      | 'azureConfig'
      | 'anthropicConfig'
      | 'vertexConfig'
      | 'ollamaConfig'
    >
    const config = get()[configKey] as LLMConfig
    if (!config) return false

    if (provider === 'azure') {
      return !!(config.apiKey && config.endpoint && config.deploymentName)
    }
    if (provider === 'vertex') {
      return !!(config.project && config.location && config.model)
    }
    if (provider === 'ollama') {
      return !!(config.baseURL && config.model)
    }
    return !!(config.apiKey && config.model)
  },

  initializeStore: async () => {
    if (get().isInitialized) return
    try {
      const settings = window.ctg?.settings
      if (settings?.getAllLLMConfigs) {
        const allConfigs = await settings.getAllLLMConfigs()
        set({
          openaiConfig: allConfigs.openai || { ...initialConfig },
          googleConfig: allConfigs.google || { ...initialConfig },
          azureConfig: allConfigs.azure || { ...initialConfig },
          anthropicConfig: allConfigs.anthropic || { ...initialConfig },
          vertexConfig: allConfigs.vertex || { ...initialConfig },
          ollamaConfig: allConfigs.ollama || { ...initialConfig },
          embeddingConfig: allConfigs.embedding || { ...defaultEmbeddingConfig },
          activeProvider: allConfigs.activeProvider || null,
          isInitialized: true
        })
      } else {
        set({ isInitialized: true })
      }
    } catch {
      set({ isInitialized: true })
    }
  },

  setActiveProvider: async (provider) => {
    const oldActiveProvider = get().activeProvider
    set({ activeProvider: provider })

    try {
      const settings = window.ctg?.settings
      if (settings?.setActiveLLMProvider) {
        await settings.setActiveLLMProvider(provider)
      } else {
        void 0
      }
    } catch (err) {
      set({ activeProvider: oldActiveProvider })
      throw err
    }
  },

  setOpenAIConfig: async (config) => {
    const oldConfig = get().openaiConfig
    const oldActiveProvider = get().activeProvider
    let becameActive = false

    set((state) => {
      const newOpenAIConfig = { ...state.openaiConfig, ...config }
      const shouldBecomeActive =
        state.activeProvider === null && newOpenAIConfig.apiKey && newOpenAIConfig.model
      if (shouldBecomeActive) becameActive = true
      return {
        openaiConfig: newOpenAIConfig,
        activeProvider: shouldBecomeActive ? 'openai' : state.activeProvider
      }
    })

    try {
      const settings = window.ctg?.settings
      if (settings?.setOpenAIConfig) {
        await settings.setOpenAIConfig(config)
        if (becameActive && settings.setActiveLLMProvider) {
          await settings.setActiveLLMProvider('openai')
        }
      } else {
        void 0
      }
    } catch (err) {
      set({ openaiConfig: oldConfig, activeProvider: oldActiveProvider })
      throw err
    }
  },

  setGoogleConfig: async (config) => {
    const oldConfig = get().googleConfig
    const oldActiveProvider = get().activeProvider
    let becameActive = false

    set((state) => {
      const newGoogleConfig = { ...state.googleConfig, ...config }
      const shouldBecomeActive =
        state.activeProvider === null && newGoogleConfig.apiKey && newGoogleConfig.model
      if (shouldBecomeActive) becameActive = true
      return {
        googleConfig: newGoogleConfig,
        activeProvider: shouldBecomeActive ? 'google' : state.activeProvider
      }
    })

    try {
      const settings = window.ctg?.settings
      if (settings?.setGoogleConfig) {
        await settings.setGoogleConfig(config)
        if (becameActive && settings.setActiveLLMProvider) {
          await settings.setActiveLLMProvider('google')
        }
      } else {
        void 0
      }
    } catch (err) {
      set({ googleConfig: oldConfig, activeProvider: oldActiveProvider })
      throw err
    }
  },

  setAzureConfig: async (config) => {
    const oldConfig = get().azureConfig
    const oldActiveProvider = get().activeProvider
    let becameActive = false

    set((state) => {
      const newAzureConfig = { ...state.azureConfig, ...config }
      const shouldBecomeActive =
        state.activeProvider === null &&
        newAzureConfig.apiKey &&
        newAzureConfig.endpoint &&
        newAzureConfig.deploymentName
      if (shouldBecomeActive) becameActive = true
      return {
        azureConfig: newAzureConfig,
        activeProvider: shouldBecomeActive ? 'azure' : state.activeProvider
      }
    })

    try {
      const settings = window.ctg?.settings
      if (settings?.setAzureConfig) {
        await settings.setAzureConfig(config)
        if (becameActive && settings.setActiveLLMProvider) {
          await settings.setActiveLLMProvider('azure')
        }
      } else {
        void 0
      }
    } catch (err) {
      set({ azureConfig: oldConfig, activeProvider: oldActiveProvider })
      throw err
    }
  },

  setAnthropicConfig: async (config) => {
    const oldConfig = get().anthropicConfig
    const oldActiveProvider = get().activeProvider
    let becameActive = false

    set((state) => {
      const newAnthropicConfig = { ...state.anthropicConfig, ...config }
      const shouldBecomeActive =
        state.activeProvider === null && newAnthropicConfig.apiKey && newAnthropicConfig.model
      if (shouldBecomeActive) becameActive = true
      return {
        anthropicConfig: newAnthropicConfig,
        activeProvider: shouldBecomeActive ? 'anthropic' : state.activeProvider
      }
    })

    try {
      const settings = window.ctg?.settings
      if (settings?.setAnthropicConfig) {
        await settings.setAnthropicConfig(config)
        if (becameActive && settings.setActiveLLMProvider) {
          await settings.setActiveLLMProvider('anthropic')
        }
      } else {
        void 0
      }
    } catch (err) {
      set({ anthropicConfig: oldConfig, activeProvider: oldActiveProvider })
      throw err
    }
  },

  setVertexConfig: async (config: VertexConfig) => {
    const oldConfig = get().vertexConfig
    const oldActiveProvider = get().activeProvider
    let becameActive = false

    set((state) => {
      const newVertexConfig = { ...state.vertexConfig, ...config }
      const shouldBecomeActive =
        state.activeProvider === null &&
        newVertexConfig.project &&
        newVertexConfig.location &&
        newVertexConfig.model
      if (shouldBecomeActive) becameActive = true
      return {
        vertexConfig: newVertexConfig,
        activeProvider: shouldBecomeActive ? 'vertex' : state.activeProvider
      }
    })

    try {
      const settings = window.ctg?.settings
      if (settings?.setVertexConfig) {
        await settings.setVertexConfig(config)
        if (becameActive && settings.setActiveLLMProvider) {
          await settings.setActiveLLMProvider('vertex')
        }
      } else {
        void 0
      }
    } catch (err) {
      set({ vertexConfig: oldConfig, activeProvider: oldActiveProvider })
      throw err
    }
  },

  setOllamaConfig: async (config: OllamaConfig) => {
    const oldConfig = get().ollamaConfig
    const oldActiveProvider = get().activeProvider
    let becameActive = false

    set((state) => {
      const newOllamaConfig = { ...state.ollamaConfig, ...config }
      const shouldBecomeActive =
        state.activeProvider === null && newOllamaConfig.baseURL && newOllamaConfig.model
      if (shouldBecomeActive) becameActive = true
      return {
        ollamaConfig: newOllamaConfig,
        activeProvider: shouldBecomeActive ? 'ollama' : state.activeProvider
      }
    })

    try {
      const settings = window.ctg?.settings
      if (settings?.setOllamaConfig) {
        await settings.setOllamaConfig(config)
        if (becameActive && settings.setActiveLLMProvider) {
          await settings.setActiveLLMProvider('ollama')
        }
      } else {
        void 0
      }
    } catch (err) {
      set({ ollamaConfig: oldConfig, activeProvider: oldActiveProvider })
      throw err
    }
  },

  setEmbeddingConfig: async (config: EmbeddingConfig) => {
    const oldConfig = get().embeddingConfig
    set({ embeddingConfig: config })

    try {
      const settings = window.ctg?.settings
      if (settings?.setEmbeddingConfig) {
        await settings.setEmbeddingConfig(config)
      } else {
        void 0
      }
    } catch (err) {
      set({ embeddingConfig: oldConfig })
      throw err
    }
  },

  clearProviderConfig: (provider) =>
    set((state) => {
      const configKey = `${provider}Config` as keyof Pick<
        LLMStoreState,
        | 'openaiConfig'
        | 'googleConfig'
        | 'azureConfig'
        | 'anthropicConfig'
        | 'vertexConfig'
        | 'ollamaConfig'
      >
      const newState: Partial<LLMStoreState> = {
        [configKey]: { ...initialConfig }
      }

      if (state.activeProvider === provider) {
        newState.activeProvider = null
      }
      return newState
    })
}))
