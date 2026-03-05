import { dialog, type IpcMain } from 'electron'
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
  SkillPackBundledCatalogSkill,
  SkillPackInfo,
  SkillPackInstallBundledSkillResult,
  SkillPackManagedSkillContentResult,
  SkillPackManagedSkillDeleteResult,
  SkillPackManagedSkillUpdatePayload,
  SkillPackManagedSkillUpdateResult,
  SkillPackSkillContentResult,
  SkillPackSkillDeleteResult,
  SkillPackSkillTarget,
  SkillPackSkillUpdatePayload,
  SkillPackSkillUpdateResult,
  SkillPackUploadPayload,
  SkillPackUploadResult,
  PluginPlatformConfig,
  PluginDiagnosticsSnapshot,
  ConnectorPolicyConfig
} from '../../shared/ipc-types' // Adjusted path
import { type SettingsService } from '../services/settings-service'
import { type MCPClientService } from '../services/mcp-client-service'
import { type SkillPackService } from '../services/skill-pack-service'
import { type PluginLoaderService } from '../services/plugin/plugin-loader-service'
import { type LlmToolService } from '../services/llm-tool-service'
import { z } from 'zod'
import {
  DEFAULT_EMBEDDING_MODEL_BY_PROVIDER,
  DEFAULT_EMBEDDING_PROVIDER,
  SUPPORTED_EMBEDDING_PROVIDERS
} from '../../shared/embedding-constants'
import { normalizeConnectorPolicyConfig } from '../services/connectors/policy/connector-policy-config'
import {
  ensureLocalCommandOrExecutable,
  ensureLocalFilesystemPath
} from '../security/path-security'

type SettingsServiceWithGenericOps = SettingsService & {
  getSetting?: (key: string) => unknown | Promise<unknown>
  setSetting?: (key: string, value: unknown) => void | Promise<void>
}
const SUPPORTED_EMBEDDING_PROVIDER_SET = new Set(SUPPORTED_EMBEDDING_PROVIDERS)

const pluginPlatformConfigSchema = z.object({
  enabled: z.boolean(),
  workspaceRoot: z.string().trim().min(1).nullable().optional(),
  configuredPluginPaths: z.array(z.string()).default([]),
  enableBundledPlugins: z.boolean().default(false),
  allowlist: z.array(z.string()).default([]),
  denylist: z.array(z.string()).default([]),
  enabledPluginIds: z.array(z.string()).default([]),
  disabledPluginIds: z.array(z.string()).default([]),
  exclusiveSlotAssignments: z.record(z.string()).default({}),
  pluginConfigById: z.record(z.unknown()).default({})
})

const validateMcpUrl = (rawUrl: string): string => {
  const trimmed = rawUrl.trim()
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('MCP url must use http:// or https://')
    }
    return trimmed
  } catch (error) {
    if (error instanceof Error && error.message === 'MCP url must use http:// or https://') {
      throw error
    }
    throw new Error('MCP url must be a valid URL')
  }
}

const mcpServerConfigSchema = z
  .object({
    name: z.string().trim().min(1).max(128),
    url: z.string().trim().optional(),
    command: z.string().trim().optional(),
    args: z.array(z.string().trim().min(1).max(2048)).max(64).optional(),
    enabled: z.boolean()
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasUrl = typeof value.url === 'string' && value.url.trim().length > 0
    const hasCommand = typeof value.command === 'string' && value.command.trim().length > 0

    if (!hasUrl && !hasCommand) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either url or command must be provided'
      })
      return
    }

    if (hasUrl) {
      try {
        validateMcpUrl(value.url!)
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: error instanceof Error ? error.message : 'MCP url must be a valid URL'
        })
      }
    }
  })

const mcpServerConfigUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(128).optional(),
    url: z.string().trim().optional(),
    command: z.string().trim().optional(),
    args: z.array(z.string().trim().min(1).max(2048)).max(64).optional(),
    enabled: z.boolean().optional()
  })
  .strict()

const skillUploadPayloadSchema = z.object({
  fileName: z.string().trim().min(1).max(256),
  content: z.string().trim().min(1).max(200_000)
})

const managedSkillIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9._-]+$/)
  .transform((value) => value.toLowerCase())

const managedSkillUpdatePayloadSchema = z.object({
  id: managedSkillIdSchema,
  content: z.string().trim().min(1).max(200_000)
})

const skillSourceSchema = z.enum(['workspace', 'global', 'managed', 'bundled'])

const skillTargetSchema = z.object({
  id: managedSkillIdSchema,
  source: skillSourceSchema,
  sourcePath: z.string().trim().min(1).max(4096)
})

const skillUpdatePayloadSchema = skillTargetSchema.extend({
  content: z.string().trim().min(1).max(200_000)
})

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

const normalizeStringArray = (values: string[]): string[] => {
  const unique = new Set<string>()
  for (const value of values) {
    const normalized = value.trim()
    if (normalized.length > 0) {
      unique.add(normalized)
    }
  }
  return Array.from(unique.values()).sort((a, b) => a.localeCompare(b))
}

const normalizeSkillId = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

const normalizeSkillIdArray = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return []
  }

  const unique = new Set<string>()
  for (const value of values) {
    if (typeof value !== 'string') {
      continue
    }
    const normalized = normalizeSkillId(value)
    if (!normalized || normalized === '.' || normalized === '..') {
      continue
    }
    unique.add(normalized)
  }

  return Array.from(unique.values()).sort((a, b) => a.localeCompare(b))
}

const normalizePluginPlatformConfig = (config: PluginPlatformConfig): PluginPlatformConfig => {
  const normalizedWorkspaceRoot =
    typeof config.workspaceRoot === 'string' && config.workspaceRoot.trim().length > 0
      ? config.workspaceRoot.trim()
      : null

  const normalizedSlotAssignments: Record<string, string> = {}
  for (const [slot, pluginId] of Object.entries(config.exclusiveSlotAssignments || {})) {
    const normalizedSlot = slot.trim()
    const normalizedPluginId = pluginId.trim()
    if (!normalizedSlot || !normalizedPluginId) {
      continue
    }
    normalizedSlotAssignments[normalizedSlot] = normalizedPluginId
  }

  const normalizedPluginConfigById: Record<string, unknown> = {}
  for (const [pluginId, pluginConfig] of Object.entries(config.pluginConfigById || {})) {
    const normalizedPluginId = pluginId.trim()
    if (!normalizedPluginId) {
      continue
    }
    normalizedPluginConfigById[normalizedPluginId] = pluginConfig
  }

  return {
    enabled: config.enabled,
    workspaceRoot: normalizedWorkspaceRoot,
    configuredPluginPaths: normalizeStringArray(config.configuredPluginPaths || []),
    enableBundledPlugins: config.enableBundledPlugins,
    allowlist: normalizeStringArray(config.allowlist || []),
    denylist: normalizeStringArray(config.denylist || []),
    enabledPluginIds: normalizeStringArray(config.enabledPluginIds || []),
    disabledPluginIds: normalizeStringArray(config.disabledPluginIds || []),
    exclusiveSlotAssignments: normalizedSlotAssignments,
    pluginConfigById: normalizedPluginConfigById
  }
}

const normalizePathList = (paths: string[]): string[] => {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const rawPath of paths) {
    const resolved = ensureLocalFilesystemPath(rawPath, 'Plugin path')
    if (seen.has(resolved)) {
      continue
    }

    seen.add(resolved)
    normalized.push(resolved)
  }

  return normalized
}

const validatePluginPlatformPaths = (config: PluginPlatformConfig): PluginPlatformConfig => {
  return {
    ...config,
    workspaceRoot:
      typeof config.workspaceRoot === 'string' && config.workspaceRoot.trim().length > 0
        ? ensureLocalFilesystemPath(config.workspaceRoot, 'Plugin workspace root')
        : null,
    configuredPluginPaths: normalizePathList(config.configuredPluginPaths || [])
  }
}

const normalizeMcpConfig = (config: Omit<McpServerConfig, 'id'>): Omit<McpServerConfig, 'id'> => {
  const parsed = mcpServerConfigSchema.parse(config)
  const url = parsed.url?.trim()
  const command = parsed.command?.trim()
  const args = normalizeStringArray(parsed.args || [])

  return {
    name: parsed.name.trim(),
    url: url && url.length > 0 ? validateMcpUrl(url) : undefined,
    command: command && command.length > 0 ? ensureLocalCommandOrExecutable(command) : undefined,
    args: args.length > 0 ? args : undefined,
    enabled: parsed.enabled
  }
}

const normalizeMcpUpdate = (
  updates: Partial<Omit<McpServerConfig, 'id'>>
): Partial<Omit<McpServerConfig, 'id'>> => {
  const parsed = mcpServerConfigUpdateSchema.parse(updates)
  const normalized: Partial<Omit<McpServerConfig, 'id'>> = {}

  if (typeof parsed.name === 'string') {
    normalized.name = parsed.name.trim()
  }
  if (typeof parsed.url === 'string') {
    const trimmed = parsed.url.trim()
    normalized.url = trimmed.length > 0 ? validateMcpUrl(trimmed) : undefined
  }
  if (typeof parsed.command === 'string') {
    const trimmed = parsed.command.trim()
    normalized.command = trimmed.length > 0 ? ensureLocalCommandOrExecutable(trimmed) : undefined
  }
  if (Array.isArray(parsed.args)) {
    const args = normalizeStringArray(parsed.args)
    normalized.args = args.length > 0 ? args : undefined
  }
  if (typeof parsed.enabled === 'boolean') {
    normalized.enabled = parsed.enabled
  }

  if (Object.keys(normalized).length === 0) {
    throw new Error('No valid MCP fields were provided for update')
  }

  return normalized
}

const needsMcpExecutionApproval = (
  config: Omit<McpServerConfig, 'id'> | Partial<Omit<McpServerConfig, 'id'>>
): boolean => {
  return typeof config.command === 'string' && config.command.trim().length > 0
}

const requestSecurityApproval = async (
  title: string,
  message: string,
  detail: string
): Promise<boolean> => {
  const result = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Allow', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    title,
    message,
    detail
  })
  return result.response === 0
}

const isPluginPathChange = (
  previous: PluginPlatformConfig,
  next: PluginPlatformConfig
): boolean => {
  const previousWorkspace = previous.workspaceRoot || null
  const nextWorkspace = next.workspaceRoot || null
  if (previousWorkspace !== nextWorkspace) {
    return true
  }

  if (previous.configuredPluginPaths.length !== next.configuredPluginPaths.length) {
    return true
  }

  return previous.configuredPluginPaths.some(
    (pathValue, index) => pathValue !== next.configuredPluginPaths[index]
  )
}

export function registerSettingsIpcHandlers(
  ipcMain: IpcMain,
  settingsService: SettingsService,
  mcpClientService: MCPClientService,
  skillPackService: SkillPackService,
  pluginLoaderService: PluginLoaderService,
  llmToolService: LlmToolService
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
      return await settingsService.getOpenAIConfigForRenderer()
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
      return await settingsService.getGoogleConfigForRenderer()
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
      return await settingsService.getAzureConfigForRenderer()
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
      return await settingsService.getAnthropicConfigForRenderer()
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
      return await settingsService.getVertexConfigForRenderer()
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
      const configsToReturn = await settingsService.getAllLLMConfigsForRenderer()
      return configsToReturn
    } catch {
      return {
        openai: undefined,
        google: undefined,
        azure: undefined,
        anthropic: undefined,
        vertex: undefined,
        ollama: undefined,
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
        const safeConfig = normalizeMcpConfig(config)
        if (needsMcpExecutionApproval(safeConfig)) {
          const approved = await requestSecurityApproval(
            'MCP Command Approval',
            'Allow saving an MCP server that can execute a local command?',
            `Command: ${safeConfig.command}\n\nOnly allow this if you trust the executable and arguments.`
          )
          if (!approved) {
            throw new Error('User denied MCP command approval')
          }
        }

        const newConfig = await settingsService.addMcpServerConfiguration(safeConfig)
        return newConfig
      } catch (error) {
        if (error instanceof Error && error.message === 'User denied MCP command approval') {
          return null
        }
        return null
      }
    }
  )

  ipcMain.handle(
    IpcChannels.updateMcpServerConfig,
    async (_event, configId: string, updates: Partial<Omit<McpServerConfig, 'id'>>) => {
      try {
        const normalizedConfigId = z.string().trim().min(1).parse(configId)
        const safeUpdates = normalizeMcpUpdate(updates)

        if (needsMcpExecutionApproval(safeUpdates)) {
          const approved = await requestSecurityApproval(
            'MCP Command Approval',
            'Allow updating an MCP server command?',
            `Updated command: ${safeUpdates.command}\n\nOnly allow this change for trusted executables.`
          )
          if (!approved) {
            throw new Error('User denied MCP command approval')
          }
        }

        const updatedConfig = await settingsService.updateMcpServerConfiguration(
          normalizedConfigId,
          safeUpdates
        )
        return updatedConfig
      } catch (error) {
        if (error instanceof Error && error.message === 'User denied MCP command approval') {
          return null
        }
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
        const safeConfig = normalizeMcpConfig(config)
        if (needsMcpExecutionApproval(safeConfig)) {
          const approved = await requestSecurityApproval(
            'MCP Test Execution Approval',
            'Allow running a local MCP command for this connection test?',
            `Command: ${safeConfig.command}\n\nTesting will execute this command on your machine.`
          )
          if (!approved) {
            return {
              success: false,
              error: 'MCP command test cancelled by user'
            }
          }
        }

        return await mcpClientService.testServerConnection(safeConfig)
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
        workspaceRoot: null,
        disabledSkillIds: []
      } satisfies SkillPackConfig
    }
  })

  ipcMain.handle(IpcChannels.setSkillPackConfig, async (_event, config: SkillPackConfig) => {
    try {
      const storedConfig = await settingsService.getSkillPackConfig()
      const safeConfig: SkillPackConfig = {
        workspaceRoot:
          typeof config?.workspaceRoot === 'string'
            ? config.workspaceRoot.trim().length > 0
              ? config.workspaceRoot.trim()
              : null
            : typeof storedConfig.workspaceRoot === 'string' &&
                storedConfig.workspaceRoot.trim().length > 0
              ? storedConfig.workspaceRoot.trim()
              : null,
        disabledSkillIds:
          config && 'disabledSkillIds' in config
            ? normalizeSkillIdArray(config.disabledSkillIds)
            : normalizeSkillIdArray(storedConfig.disabledSkillIds)
      }

      await settingsService.setSkillPackConfig(safeConfig)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  const resolveSkillWorkspaceRoot = async (workspaceRoot?: string): Promise<string | undefined> => {
    const storedConfig = await settingsService.getSkillPackConfig()
    return typeof workspaceRoot === 'string' && workspaceRoot.trim().length > 0
      ? workspaceRoot.trim()
      : typeof storedConfig.workspaceRoot === 'string' &&
          storedConfig.workspaceRoot.trim().length > 0
        ? storedConfig.workspaceRoot.trim()
        : undefined
  }

  ipcMain.handle(IpcChannels.listAvailableSkills, async (_event, workspaceRoot?: string) => {
    try {
      const safeWorkspaceRoot = await resolveSkillWorkspaceRoot(workspaceRoot)

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

  ipcMain.handle(IpcChannels.listBundledSkillCatalog, async () => {
    try {
      const catalog = await skillPackService.listBundledSkillCatalog()
      return catalog.map(
        (skill): SkillPackBundledCatalogSkill => ({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          repositoryPath: skill.repositoryPath,
          isInstalled: skill.isInstalled
        })
      )
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : 'Failed to load bundled skill catalog'
      )
    }
  })

  ipcMain.handle(IpcChannels.installBundledSkill, async (_event, rawSkillId: unknown) => {
    try {
      const skillId = managedSkillIdSchema.parse(rawSkillId)
      const result = await skillPackService.installBundledSkill(skillId)
      return {
        id: result.id,
        name: result.name,
        description: result.description,
        sourcePath: result.sourcePath,
        overwritten: result.overwritten
      } satisfies SkillPackInstallBundledSkillResult
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to install bundled skill')
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

  ipcMain.handle(IpcChannels.uploadManagedSkill, async (_event, rawPayload: unknown) => {
    try {
      const payload = skillUploadPayloadSchema.parse(rawPayload) satisfies SkillPackUploadPayload
      const result = skillPackService.uploadManagedSkill({
        fileName: payload.fileName,
        content: payload.content
      })

      return {
        id: result.id,
        name: result.name,
        description: result.description,
        sourcePath: result.sourcePath,
        overwritten: result.overwritten
      } satisfies SkillPackUploadResult
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to upload skill')
    }
  })

  ipcMain.handle(IpcChannels.getManagedSkillContent, async (_event, rawSkillId: unknown) => {
    try {
      const skillId = managedSkillIdSchema.parse(rawSkillId)
      const result = skillPackService.getManagedSkillContent(skillId)
      return {
        id: result.id,
        sourcePath: result.sourcePath,
        content: result.content
      } satisfies SkillPackManagedSkillContentResult
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to load managed skill')
    }
  })

  ipcMain.handle(IpcChannels.updateManagedSkill, async (_event, rawPayload: unknown) => {
    try {
      const payload = managedSkillUpdatePayloadSchema.parse(
        rawPayload
      ) satisfies SkillPackManagedSkillUpdatePayload
      const result = skillPackService.updateManagedSkill({
        id: payload.id,
        content: payload.content
      })

      return {
        id: result.id,
        name: result.name,
        description: result.description,
        sourcePath: result.sourcePath
      } satisfies SkillPackManagedSkillUpdateResult
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to update managed skill')
    }
  })

  ipcMain.handle(IpcChannels.deleteManagedSkill, async (_event, rawSkillId: unknown) => {
    try {
      const skillId = managedSkillIdSchema.parse(rawSkillId)
      const deleted = skillPackService.deleteManagedSkill(skillId)
      return {
        id: skillId,
        deleted
      } satisfies SkillPackManagedSkillDeleteResult
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to delete managed skill')
    }
  })

  ipcMain.handle(IpcChannels.getSkillContent, async (_event, rawTarget: unknown) => {
    try {
      const target = skillTargetSchema.parse(rawTarget) satisfies SkillPackSkillTarget
      const safeWorkspaceRoot = await resolveSkillWorkspaceRoot()
      const result = skillPackService.getSkillContent(
        {
          id: target.id,
          source: target.source,
          sourcePath: target.sourcePath
        },
        { workspaceRoot: safeWorkspaceRoot }
      )
      return {
        id: result.id,
        source: result.source,
        sourcePath: result.sourcePath,
        content: result.content
      } satisfies SkillPackSkillContentResult
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to load skill')
    }
  })

  ipcMain.handle(IpcChannels.updateSkill, async (_event, rawPayload: unknown) => {
    try {
      const payload = skillUpdatePayloadSchema.parse(
        rawPayload
      ) satisfies SkillPackSkillUpdatePayload
      const safeWorkspaceRoot = await resolveSkillWorkspaceRoot()
      const result = skillPackService.updateSkill(
        {
          id: payload.id,
          source: payload.source,
          sourcePath: payload.sourcePath,
          content: payload.content
        },
        { workspaceRoot: safeWorkspaceRoot }
      )
      return {
        id: result.id,
        name: result.name,
        description: result.description,
        source: result.source,
        sourcePath: result.sourcePath
      } satisfies SkillPackSkillUpdateResult
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to update skill')
    }
  })

  ipcMain.handle(IpcChannels.deleteSkill, async (_event, rawTarget: unknown) => {
    try {
      const target = skillTargetSchema.parse(rawTarget) satisfies SkillPackSkillTarget
      const safeWorkspaceRoot = await resolveSkillWorkspaceRoot()
      const deleted = skillPackService.deleteSkill(
        {
          id: target.id,
          source: target.source,
          sourcePath: target.sourcePath
        },
        { workspaceRoot: safeWorkspaceRoot }
      )

      return {
        id: target.id,
        source: target.source,
        sourcePath: target.sourcePath,
        deleted
      } satisfies SkillPackSkillDeleteResult
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to delete skill')
    }
  })

  ipcMain.handle(IpcChannels.getPluginPlatformConfig, async () => {
    try {
      return await settingsService.getPluginPlatformConfig()
    } catch {
      return {
        enabled: true,
        workspaceRoot: null,
        configuredPluginPaths: [],
        enableBundledPlugins: false,
        allowlist: [],
        denylist: [],
        enabledPluginIds: [],
        disabledPluginIds: [],
        exclusiveSlotAssignments: {},
        pluginConfigById: {}
      } satisfies PluginPlatformConfig
    }
  })

  ipcMain.handle(IpcChannels.setPluginPlatformConfig, async (_event, rawConfig: unknown) => {
    const parsed = pluginPlatformConfigSchema.parse(rawConfig)
    const normalizedConfig = normalizePluginPlatformConfig(parsed)
    const safeConfig = validatePluginPlatformPaths(normalizedConfig)
    const previousConfig = await settingsService.getPluginPlatformConfig()

    if (isPluginPathChange(previousConfig, safeConfig)) {
      const approved = await requestSecurityApproval(
        'Plugin Path Approval',
        'Allow updating plugin runtime paths?',
        `Workspace root: ${safeConfig.workspaceRoot || '(none)'}\nConfigured plugin paths: ${
          safeConfig.configuredPluginPaths.length > 0
            ? safeConfig.configuredPluginPaths.join(', ')
            : '(none)'
        }\n\nOnly allow this change for trusted local directories.`
      )
      if (!approved) {
        throw new Error('User denied plugin path approval')
      }
    }

    await settingsService.setPluginPlatformConfig(safeConfig)
    await pluginLoaderService.reload()
    llmToolService.refreshPluginToolsFromLoader()
  })

  ipcMain.handle(IpcChannels.getPluginDiagnostics, async (): Promise<PluginDiagnosticsSnapshot> => {
    return pluginLoaderService.getDiagnosticsSnapshot()
  })

  ipcMain.handle(IpcChannels.reloadPluginRuntime, async (): Promise<PluginDiagnosticsSnapshot> => {
    const approved = await requestSecurityApproval(
      'Plugin Runtime Reload',
      'Allow reloading runtime plugins now?',
      'Reloading can execute plugin code from configured directories.'
    )
    if (!approved) {
      throw new Error('User denied plugin runtime reload')
    }

    const snapshot = await pluginLoaderService.reload()
    llmToolService.refreshPluginToolsFromLoader()
    return snapshot
  })

  ipcMain.handle(IpcChannels.getConnectorPolicyConfig, async (): Promise<ConnectorPolicyConfig> => {
    try {
      return await settingsService.getConnectorPolicyConfig()
    } catch {
      return normalizeConnectorPolicyConfig(null)
    }
  })

  ipcMain.handle(IpcChannels.setConnectorPolicyConfig, async (_event, rawConfig: unknown) => {
    try {
      const normalized = normalizeConnectorPolicyConfig(rawConfig as Partial<ConnectorPolicyConfig>)
      await settingsService.setConnectorPolicyConfig(normalized)
      try {
        await llmToolService.refreshMcpToolsFromPolicy()
      } catch {
        // Policy persisted successfully; MCP refresh can recover on next startup.
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
}
