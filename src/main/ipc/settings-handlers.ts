import { type IpcMain } from 'electron'
import {
  IpcChannels,
  OpenAIConfig,
  GoogleConfig,
  AzureConfig,
  AnthropicConfig,
  LLMProviderType,
  McpServerConfig,
  VertexConfig,
  OllamaConfig,
  EmbeddingConfig,
  SystemPromptConfig,
  SkillPackConfig,
  SkillPackInfo
} from '../../shared/ipc-types' // Adjusted path
import { type SettingsService } from '../services/settings-service'
import { type MCPClientService } from '../services/mcp-client-service'
import { type SkillPackService } from '../services/skill-pack-service'
import {
  DEFAULT_EMBEDDING_MODEL_BY_PROVIDER,
  DEFAULT_EMBEDDING_PROVIDER,
  SUPPORTED_EMBEDDING_PROVIDERS
} from '../../shared/embedding-constants'

type SettingsServiceWithGenericOps = SettingsService & {
  getSetting?: (key: string) => unknown | Promise<unknown>
  setSetting?: (key: string, value: unknown) => void | Promise<void>
}
const SUPPORTED_EMBEDDING_PROVIDER_SET = new Set(SUPPORTED_EMBEDDING_PROVIDERS)

const sanitizeEmbeddingConfig = (config: EmbeddingConfig): EmbeddingConfig => {
  if (!SUPPORTED_EMBEDDING_PROVIDER_SET.has(config.provider)) {
    throw new Error(
      `Unsupported embedding provider: ${config.provider}. Supported providers: ${SUPPORTED_EMBEDDING_PROVIDERS.join(', ')}`
    )
  }

  const model = config.model?.trim()
  if (!model) {
    throw new Error('Embedding model is required')
  }

  return {
    provider: config.provider,
    model
  }
}

export function registerSettingsIpcHandlers(
  ipcMain: IpcMain,
  settingsService: SettingsService,
  mcpClientService: MCPClientService,
  skillPackService: SkillPackService
): void {
  const genericSettingsService = settingsService as SettingsServiceWithGenericOps

  // --- Generic SettingsService IPC Handlers (if still needed) ---
  ipcMain.handle('ctg:settings:get', async (_event, key: string) => {
    try {
      if (typeof genericSettingsService.getSetting === 'function') {
        return genericSettingsService.getSetting(key)
      }
      return undefined
    } catch {
      return undefined
    }
  })

  ipcMain.handle('ctg:settings:set', async (_event, key: string, value: unknown) => {
    try {
      if (typeof genericSettingsService.setSetting === 'function') {
        await genericSettingsService.setSetting(key, value)
        return { success: true }
      }
      return { success: false, error: 'setSetting not available' }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // --- LLM Specific IPC Handlers ---
  ipcMain.handle(IpcChannels.setOpenAIConfig, async (_event, config: OpenAIConfig) => {
    try {
      if (config.apiKey === '') {
        await settingsService.clearOpenAIConfig()
      } else {
        await settingsService.setOpenAIConfig(config)
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IpcChannels.getOpenAIConfig, async () => {
    try {
      return await settingsService.getOpenAIConfig()
    } catch {
      return null
    }
  })

  ipcMain.handle(IpcChannels.setGoogleConfig, async (_event, config: GoogleConfig) => {
    try {
      if (config.apiKey === '') {
        await settingsService.clearGoogleConfig()
      } else {
        await settingsService.setGoogleConfig(config)
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IpcChannels.getGoogleConfig, async () => {
    try {
      return await settingsService.getGoogleConfig()
    } catch {
      return null
    }
  })

  ipcMain.handle(IpcChannels.setAzureConfig, async (_event, config: AzureConfig) => {
    try {
      if (config.apiKey === '') {
        await settingsService.clearAzureConfig()
      } else {
        await settingsService.setAzureConfig(config)
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IpcChannels.getAzureConfig, async () => {
    try {
      return await settingsService.getAzureConfig()
    } catch {
      return null
    }
  })

  ipcMain.handle(IpcChannels.setAnthropicConfig, async (_event, config: AnthropicConfig) => {
    try {
      if (config.apiKey === '') {
        await settingsService.clearAnthropicConfig()
      } else {
        await settingsService.setAnthropicConfig(config)
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IpcChannels.getAnthropicConfig, async () => {
    try {
      return await settingsService.getAnthropicConfig()
    } catch {
      return null
    }
  })

  // Vertex AI IPC Handlers
  ipcMain.handle(IpcChannels.setVertexConfig, async (_event, config: VertexConfig) => {
    try {
      if (config.apiKey === '' && !config.project && !config.location && !config.model) {
        await settingsService.clearVertexConfig()
      } else {
        await settingsService.setVertexConfig(config)
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IpcChannels.getVertexConfig, async () => {
    try {
      return await settingsService.getVertexConfig()
    } catch {
      return null
    }
  })

  // Ollama IPC Handlers
  ipcMain.handle(IpcChannels.setOllamaConfig, async (_event, config: OllamaConfig) => {
    try {
      if (config.baseURL === '' && config.model === '') {
        await settingsService.clearOllamaConfig()
      } else {
        await settingsService.setOllamaConfig(config)
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IpcChannels.getOllamaConfig, async () => {
    try {
      return await settingsService.getOllamaConfig()
    } catch {
      return null
    }
  })

  ipcMain.handle(IpcChannels.setEmbeddingConfig, async (_event, config: EmbeddingConfig) => {
    try {
      const safeConfig = sanitizeEmbeddingConfig(config)
      await settingsService.setEmbeddingConfig(safeConfig)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IpcChannels.getEmbeddingConfig, async () => {
    try {
      return await settingsService.getEmbeddingConfig()
    } catch {
      return {
        provider: DEFAULT_EMBEDDING_PROVIDER,
        model: DEFAULT_EMBEDDING_MODEL_BY_PROVIDER[DEFAULT_EMBEDDING_PROVIDER]
      } satisfies EmbeddingConfig
    }
  })

  ipcMain.handle(
    IpcChannels.setActiveLLMProvider,
    async (_event, provider: LLMProviderType | null) => {
      try {
        await settingsService.setActiveLLMProvider(provider)
        return { success: true }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(IpcChannels.getActiveLLMProvider, async () => {
    try {
      return await settingsService.getActiveLLMProvider()
    } catch {
      return null
    }
  })

  ipcMain.handle(IpcChannels.getAllLLMConfigs, async () => {
    try {
      const configsToReturn = await settingsService.getAllLLMConfigs()
      return configsToReturn
    } catch {
      return {
        openai: null,
        google: null,
        azure: null,
        anthropic: null,
        vertex: null,
        ollama: null,
        embedding: {
          provider: DEFAULT_EMBEDDING_PROVIDER,
          model: DEFAULT_EMBEDDING_MODEL_BY_PROVIDER[DEFAULT_EMBEDDING_PROVIDER]
        },
        activeProvider: null
      }
    }
  })

  // --- MCP Server Configuration IPC Handlers ---
  ipcMain.handle(IpcChannels.getMcpServerConfigs, async () => {
    try {
      return await settingsService.getMcpServerConfigurations()
    } catch {
      return []
    }
  })

  ipcMain.handle(
    IpcChannels.addMcpServerConfig,
    async (_event, config: Omit<McpServerConfig, 'id'>) => {
      try {
        const newConfig = await settingsService.addMcpServerConfiguration(config)
        return newConfig
      } catch {
        return null
      }
    }
  )

  ipcMain.handle(
    IpcChannels.updateMcpServerConfig,
    async (_event, configId: string, updates: Partial<Omit<McpServerConfig, 'id'>>) => {
      try {
        const updatedConfig = await settingsService.updateMcpServerConfiguration(configId, updates)
        return updatedConfig
      } catch {
        return null
      }
    }
  )

  ipcMain.handle(IpcChannels.deleteMcpServerConfig, async (_event, configId: string) => {
    try {
      const success = await settingsService.deleteMcpServerConfiguration(configId)
      return success
    } catch {
      return false
    }
  })

  ipcMain.handle(
    IpcChannels.testMcpServerConfig,
    async (_event, config: Omit<McpServerConfig, 'id'>) => {
      try {
        return await mcpClientService.testServerConnection(config)
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to test the MCP server configuration. Please try again.'
        }
      }
    }
  )

  // --- System Prompt Configuration IPC Handlers ---
  ipcMain.handle(IpcChannels.getSystemPromptConfig, async () => {
    try {
      return await settingsService.getSystemPromptConfig()
    } catch {
      return {
        userSystemPrompt: ''
      }
    }
  })

  ipcMain.handle(IpcChannels.setSystemPromptConfig, async (_event, config: SystemPromptConfig) => {
    try {
      await settingsService.setSystemPromptConfig(config)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // --- Skill Pack Configuration IPC Handlers ---
  ipcMain.handle(IpcChannels.getSkillPackConfig, async () => {
    try {
      return await settingsService.getSkillPackConfig()
    } catch {
      return {
        workspaceRoot: null
      } satisfies SkillPackConfig
    }
  })

  ipcMain.handle(IpcChannels.setSkillPackConfig, async (_event, config: SkillPackConfig) => {
    try {
      const safeConfig: SkillPackConfig = {
        workspaceRoot:
          typeof config?.workspaceRoot === 'string' && config.workspaceRoot.trim().length > 0
            ? config.workspaceRoot.trim()
            : null
      }

      await settingsService.setSkillPackConfig(safeConfig)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IpcChannels.listAvailableSkills, async (_event, workspaceRoot?: string) => {
    try {
      const storedConfig = await settingsService.getSkillPackConfig()
      const safeWorkspaceRoot =
        typeof workspaceRoot === 'string' && workspaceRoot.trim().length > 0
          ? workspaceRoot.trim()
          : typeof storedConfig.workspaceRoot === 'string' &&
              storedConfig.workspaceRoot.trim().length > 0
            ? storedConfig.workspaceRoot.trim()
            : undefined

      const skills = skillPackService.listAvailableSkills({ workspaceRoot: safeWorkspaceRoot })
      return skills.map(
        (skill): SkillPackInfo => ({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          source: skill.source,
          sourcePath: skill.sourcePath
        })
      )
    } catch {
      return []
    }
  })

  ipcMain.handle(IpcChannels.bootstrapWorkspaceTemplates, async (_event, workspaceRoot: string) => {
    try {
      if (typeof workspaceRoot !== 'string' || workspaceRoot.trim().length === 0) {
        throw new Error('workspaceRoot is required')
      }

      const normalizedRoot = workspaceRoot.trim()
      const result = skillPackService.bootstrapWorkspaceTemplateFiles(normalizedRoot)
      await settingsService.setSkillPackConfig({ workspaceRoot: normalizedRoot })
      return result
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : 'Failed to bootstrap workspace templates'
      )
    }
  })
}
