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
  SystemPromptConfig
} from '../../shared/ipc-types' // Adjusted path
import { type SettingsService } from '../services/settings-service'
import { ARION_SYSTEM_PROMPT } from '../constants/system-prompts' // Updated import

export function registerSettingsIpcHandlers(
  ipcMain: IpcMain,
  settingsService: SettingsService
): void {
  // --- Generic SettingsService IPC Handlers (if still needed) ---
  ipcMain.handle('ctg:settings:get', async (_event, key: string) => {
    try {
      if (typeof (settingsService as any).getSetting === 'function') {
        return (settingsService as any).getSetting(key)
      }
      return undefined
    } catch (error) {
      return undefined
    }
  })

  ipcMain.handle('ctg:settings:set', async (_event, key: string, value: unknown) => {
    try {
      if (typeof (settingsService as any).setSetting === 'function') {
        ;(settingsService as any).setSetting(key, value)
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      return null
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
    } catch (error) {
      return null
    }
  })

  ipcMain.handle(IpcChannels.getAllLLMConfigs, async () => {
    try {
      const configsToReturn = await settingsService.getAllLLMConfigs()
      return configsToReturn
    } catch (error) {
      return { openai: null, google: null, azure: null, anthropic: null, activeProvider: null }
    }
  })

  // --- MCP Server Configuration IPC Handlers ---
  ipcMain.handle(IpcChannels.getMcpServerConfigs, async () => {
    try {
      return await settingsService.getMcpServerConfigurations()
    } catch (error) {
      return []
    }
  })

  ipcMain.handle(
    IpcChannels.addMcpServerConfig,
    async (_event, config: Omit<McpServerConfig, 'id'>) => {
      try {
        const newConfig = await settingsService.addMcpServerConfiguration(config)
        return newConfig
      } catch (error) {
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
      } catch (error) {
        return null
      }
    }
  )

  ipcMain.handle(IpcChannels.deleteMcpServerConfig, async (_event, configId: string) => {
    try {
      const success = await settingsService.deleteMcpServerConfiguration(configId)
      return success
    } catch (error) {
      return false
    }
  })

  // --- System Prompt Configuration IPC Handlers ---
  ipcMain.handle(IpcChannels.getSystemPromptConfig, async () => {
    try {
      return await settingsService.getSystemPromptConfig()
    } catch (error) {
      return {
        defaultSystemPrompt: ARION_SYSTEM_PROMPT,
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
}
