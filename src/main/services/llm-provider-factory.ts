import { type LanguageModel, simulateStreamingMiddleware, wrapLanguageModel } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createAzure } from '@ai-sdk/azure'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createVertex } from '@ai-sdk/google-vertex'
// Replaced deprecated third-party wrapper with our in-house provider
import { createOllama } from '../providers/ollama-provider'
import { SettingsService } from './settings-service'
import { AgentRegistryService } from './agent-registry-service'
import { detectReasoningModel } from './reasoning-model-detector'

export interface LLMProviderConfig {
  provider: string
  model: string
}

export class LLMProviderFactory {
  private settingsService: SettingsService
  private agentRegistryService?: AgentRegistryService

  constructor(settingsService: SettingsService, agentRegistryService?: AgentRegistryService) {
    this.settingsService = settingsService
    this.agentRegistryService = agentRegistryService
  }

  /**
   * Create an LLM instance based on agent-specific configuration or fall back to global settings
   * @param agentId Optional agent ID to get model configuration for
   * @returns Promise<LanguageModel> configured for the agent or global settings
   */
  async createLLMFromAgentConfig(agentId?: string): Promise<LanguageModel> {
    const config = await this.getLLMConfig(agentId)
    return this.createLLMFromConfig(config.provider, config.model)
  }

  /**
   * Get LLM configuration for an agent or global settings
   * @param agentId Optional agent ID to get configuration for
   * @returns Promise<LLMProviderConfig> containing provider and model
   */
  async getLLMConfig(agentId?: string): Promise<LLMProviderConfig> {
    let provider: string
    let model: string

    // Try to get agent-specific configuration first
    if (agentId && this.agentRegistryService) {
      try {
        const agent = await this.agentRegistryService.getAgentById(agentId)
        if (agent?.modelConfig) {
          // Validate agent model configuration
          const modelConfig = agent.modelConfig
          if (!modelConfig.provider || !modelConfig.model) {
            provider = (await this.settingsService.getActiveLLMProvider()) || ''
            model = await this.getGlobalModelForProvider(provider)
          } else {
            provider = modelConfig.provider
            model = modelConfig.model

            // Validate that the provider is supported
            const supportedProviders = [
              'openai',
              'google',
              'azure',
              'anthropic',
              'vertex',
              'ollama'
            ]
            if (!supportedProviders.includes(provider.toLowerCase())) {
              provider = (await this.settingsService.getActiveLLMProvider()) || ''
              model = await this.getGlobalModelForProvider(provider)
            }
          }
        } else {
          // Fall back to global settings
          provider = (await this.settingsService.getActiveLLMProvider()) || ''
          model = await this.getGlobalModelForProvider(provider)
        }
      } catch (error) {
        // Fall back to global settings
        provider = (await this.settingsService.getActiveLLMProvider()) || ''
        model = await this.getGlobalModelForProvider(provider)
      }
    } else {
      // Use global settings
      provider = (await this.settingsService.getActiveLLMProvider()) || ''
      model = await this.getGlobalModelForProvider(provider)
    }

    if (!provider) {
      throw new Error('No LLM provider configured (neither agent-specific nor global)')
    }

    if (!model) {
      throw new Error(
        `No LLM model configured for provider '${provider}' (neither agent-specific nor global)`
      )
    }

    return { provider, model }
  }

  /**
   * Create an LLM instance from provider and model configuration
   * @param provider The LLM provider name
   * @param model The model name/ID
   * @returns Promise<LanguageModel> configured LLM instance
   */
  async createLLMFromConfig(provider: string, model: string): Promise<LanguageModel> {
    switch (provider) {
      case 'openai':
        return this.createOpenAILLM(model)
      case 'google':
        return this.createGoogleLLM(model)
      case 'azure':
        return this.createAzureLLM(model)
      case 'anthropic':
        return this.createAnthropicLLM(model)
      case 'vertex':
        return this.createVertexLLM(model)
      case 'ollama':
        return this.createOllamaLLM(model)
      default:
        throw new Error(`Unsupported LLM provider: ${provider}`)
    }
  }

  /**
   * Helper method to get the global model name for a given provider
   */
  private async getGlobalModelForProvider(provider: string): Promise<string> {
    switch (provider) {
      case 'openai':
        const openaiConfig = await this.settingsService.getOpenAIConfig()
        return openaiConfig?.model || ''
      case 'google':
        const googleConfig = await this.settingsService.getGoogleConfig()
        return googleConfig?.model || ''
      case 'azure':
        const azureConfig = await this.settingsService.getAzureConfig()
        return azureConfig?.deploymentName || ''
      case 'anthropic':
        const anthropicConfig = await this.settingsService.getAnthropicConfig()
        return anthropicConfig?.model || ''
      case 'vertex':
        const vertexConfig = await this.settingsService.getVertexConfig()
        return vertexConfig?.model || ''
      case 'ollama':
        const ollamaConfig = await this.settingsService.getOllamaConfig()
        return ollamaConfig?.model || ''
      default:
        return ''
    }
  }

  /**
   * Create OpenAI LLM instance
   */
  private async createOpenAILLM(model: string): Promise<LanguageModel> {
    const openaiConfig = await this.settingsService.getOpenAIConfig()
    if (!openaiConfig?.apiKey) {
      throw new Error('OpenAI provider is not configured correctly.')
    }
    const customOpenAI = createOpenAI({ apiKey: openaiConfig.apiKey })
    // IMPORTANT: use auto API selection so reasoning models (o3/o4-mini) use Responses API
    // which supports reasoning summaries and streaming reasoning events.
    return customOpenAI(model as any)
  }

  /**
   * Create Google LLM instance
   */
  private async createGoogleLLM(model: string): Promise<LanguageModel> {
    const googleConfig = await this.settingsService.getGoogleConfig()
    if (!googleConfig?.apiKey) {
      throw new Error('Google provider is not configured correctly.')
    }
    const customGoogleProvider = createGoogleGenerativeAI({ apiKey: googleConfig.apiKey })
    return customGoogleProvider(model as any)
  }

  /**
   * Create Azure OpenAI LLM instance
   */
  private async createAzureLLM(model: string): Promise<LanguageModel> {
    const azureConfig = await this.settingsService.getAzureConfig()
    if (!azureConfig?.apiKey || !azureConfig.endpoint || !azureConfig.deploymentName) {
      throw new Error('Azure OpenAI provider is not configured correctly.')
    }
    const configuredAzure = createAzure({
      apiKey: azureConfig.apiKey,
      baseURL: azureConfig.endpoint,
      apiVersion: '2024-04-01-preview'
    })
    return configuredAzure.chat(model || azureConfig.deploymentName) as unknown as LanguageModel
  }

  /**
   * Create Anthropic LLM instance
   */
  private async createAnthropicLLM(model: string): Promise<LanguageModel> {
    const anthropicConfig = await this.settingsService.getAnthropicConfig()
    if (!anthropicConfig?.apiKey) {
      throw new Error('Anthropic provider is not configured correctly.')
    }
    const customAnthropic = createAnthropic({ apiKey: anthropicConfig.apiKey })
    return customAnthropic.messages(model as any)
  }

  /**
   * Create Vertex AI LLM instance
   */
  private async createVertexLLM(model: string): Promise<LanguageModel> {
    const vertexConfig = await this.settingsService.getVertexConfig()
    if (!vertexConfig?.apiKey || !vertexConfig.project || !vertexConfig.location) {
      throw new Error('Vertex AI provider is not configured correctly.')
    }
    let credentialsJson: any = undefined
    try {
      if (vertexConfig.apiKey.trim().startsWith('{')) {
        credentialsJson = JSON.parse(vertexConfig.apiKey)
      }
    } catch (e) {}
    const vertexProvider = createVertex({
      ...(credentialsJson ? { googleAuthOptions: { credentials: credentialsJson } } : {}),
      project: vertexConfig.project,
      location: vertexConfig.location
    })
    return vertexProvider(model as any) as unknown as LanguageModel
  }

  /**
   * Create Ollama LLM instance
   */
  private async createOllamaLLM(model: string): Promise<LanguageModel> {
    const ollamaConfig = await this.settingsService.getOllamaConfig()
    if (!ollamaConfig?.baseURL) {
      throw new Error('Ollama provider is not configured correctly.')
    }

    // Our provider expects the Ollama host without /api (client adds endpoints)
    // Normalize: remove trailing slash and optional trailing /api
    let baseURL = ollamaConfig.baseURL.trim()
    baseURL = baseURL.replace(/\/$/, '')
    baseURL = baseURL.replace(/\/api\/?$/, '')

    const ollamaProvider = createOllama({ baseURL })

    // Keep behavior: wrap simulate streaming for non-reasoning models only
    const isReasoningModel = detectReasoningModel(model)
    if (!isReasoningModel) {
      return wrapLanguageModel({
        model: ollamaProvider(model as any),
        middleware: simulateStreamingMiddleware()
      })
    }

    return ollamaProvider(model as any)
  }
}
