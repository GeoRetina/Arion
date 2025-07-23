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
    console.log(`[Settings Handlers IPC] Received 'ctg:settings:get' for key: ${key}`)
    try {
      if (typeof (settingsService as any).getSetting === 'function') {
        return (settingsService as any).getSetting(key)
      }
      console.warn('[Settings Handlers IPC] settingsService.getSetting is not a function')
      return undefined
    } catch (error) {
      console.error(`[Settings Handlers IPC] Error getting setting for key ${key}:`, error)
      return undefined
    }
  })

  ipcMain.handle('ctg:settings:set', async (_event, key: string, value: unknown) => {
    console.log(
      `[Settings Handlers IPC] Received 'ctg:settings:set' for key: ${key} with value:`,
      value
    )
    try {
      if (typeof (settingsService as any).setSetting === 'function') {
        ;(settingsService as any).setSetting(key, value)
        return { success: true }
      }
      console.warn('[Settings Handlers IPC] settingsService.setSetting is not a function')
      return { success: false, error: 'setSetting not available' }
    } catch (error) {
      console.error(`[Settings Handlers IPC] Error setting for key ${key}:`, error)
      return { success: false, error: (error as Error).message }
    }
  })
  console.log(
    '[Main Process] Generic SettingsService IPC handlers registered by settings.handlers.ts.'
  )

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
      console.error('[Settings Handlers IPC] Error in setOpenAIConfig:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IpcChannels.getOpenAIConfig, async () => {
    try {
      return await settingsService.getOpenAIConfig()
    } catch (error) {
      console.error('[Settings Handlers IPC] Error in getOpenAIConfig:', error)
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
      console.error('[Settings Handlers IPC] Error in setGoogleConfig:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IpcChannels.getGoogleConfig, async () => {
    try {
      return await settingsService.getGoogleConfig()
    } catch (error) {
      console.error('[Settings Handlers IPC] Error in getGoogleConfig:', error)
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
      console.error('[Settings Handlers IPC] Error in setAzureConfig:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IpcChannels.getAzureConfig, async () => {
    try {
      return await settingsService.getAzureConfig()
    } catch (error) {
      console.error('[Settings Handlers IPC] Error in getAzureConfig:', error)
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
      console.error('[Settings Handlers IPC] Error in setAnthropicConfig:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IpcChannels.getAnthropicConfig, async () => {
    try {
      return await settingsService.getAnthropicConfig()
    } catch (error) {
      console.error('[Settings Handlers IPC] Error in getAnthropicConfig:', error)
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
      console.error('[Settings Handlers IPC] Error in setVertexConfig:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IpcChannels.getVertexConfig, async () => {
    try {
      return await settingsService.getVertexConfig()
    } catch (error) {
      console.error('[Settings Handlers IPC] Error in getVertexConfig:', error)
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
      console.error('[Settings Handlers IPC] Error in setOllamaConfig:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IpcChannels.getOllamaConfig, async () => {
    try {
      return await settingsService.getOllamaConfig()
    } catch (error) {
      console.error('[Settings Handlers IPC] Error in getOllamaConfig:', error)
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
        console.error('[Settings Handlers IPC] Error in setActiveLLMProvider:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(IpcChannels.getActiveLLMProvider, async () => {
    try {
      return await settingsService.getActiveLLMProvider()
    } catch (error) {
      console.error('[Settings Handlers IPC] Error in getActiveLLMProvider:', error)
      return null
    }
  })

  ipcMain.handle(IpcChannels.getAllLLMConfigs, async () => {
    try {
      const configsToReturn = await settingsService.getAllLLMConfigs()
      return configsToReturn
    } catch (error) {
      console.error('[Settings Handlers IPC:getAllLLMConfigs] Error in getAllLLMConfigs:', error)
      return { openai: null, google: null, azure: null, anthropic: null, activeProvider: null }
    }
  })
  console.log('[Main Process] LLM specific IPC handlers registered by settings.handlers.ts.')

  // --- MCP Server Configuration IPC Handlers ---
  ipcMain.handle(IpcChannels.getMcpServerConfigs, async () => {
    try {
      return await settingsService.getMcpServerConfigurations()
    } catch (error) {
      console.error('[Settings Handlers IPC] Error in getMcpServerConfigs:', error)
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
        console.error('[Settings Handlers IPC] Error in addMcpServerConfig:', error)
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
        console.error('[Settings Handlers IPC] Error in updateMcpServerConfig:', error)
        return null
      }
    }
  )

  ipcMain.handle(IpcChannels.deleteMcpServerConfig, async (_event, configId: string) => {
    try {
      const success = await settingsService.deleteMcpServerConfiguration(configId)
      return success
    } catch (error) {
      console.error('[Settings Handlers IPC] Error in deleteMcpServerConfig:', error)
      return false
    }
  })
  console.log(
    '[Main Process] MCP Server Configuration IPC handlers registered by settings.handlers.ts.'
  )

  // --- System Prompt Configuration IPC Handlers ---
  ipcMain.handle(IpcChannels.getSystemPromptConfig, async () => {
    try {
      return await settingsService.getSystemPromptConfig()
    } catch (error) {
      console.error('[Settings Handlers IPC] Error in getSystemPromptConfig:', error)
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
      console.error('[Settings Handlers IPC] Error in setSystemPromptConfig:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  console.log(
    '[Main Process] System Prompt Configuration IPC handlers registered by settings.handlers.ts.'
  )
}
