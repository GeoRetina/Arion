import path from 'path'
import fs from 'fs'
import Database from 'better-sqlite3'
import * as keytar from 'keytar'
import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import {
  OpenAIConfig,
  GoogleConfig,
  AzureConfig,
  AnthropicConfig,
  VertexConfig,
  OllamaConfig,
  EmbeddingConfig,
  EmbeddingProviderType,
  LLMProviderType,
  AllLLMConfigurations,
  McpServerConfig,
  SystemPromptConfig,
  SkillPackConfig,
  PluginPlatformConfig
} from '../../shared/ipc-types'
import {
  DEFAULT_EMBEDDING_MODEL_BY_PROVIDER,
  DEFAULT_EMBEDDING_PROVIDER,
  SUPPORTED_EMBEDDING_PROVIDERS
} from '../../shared/embedding-constants'

const SERVICE_NAME = 'ArionLLMCredentials'
const DB_FILENAME = 'arion-settings.db'
const EMBEDDING_CONFIG_KEY = 'embeddingConfig'

const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  provider: DEFAULT_EMBEDDING_PROVIDER,
  model: DEFAULT_EMBEDDING_MODEL_BY_PROVIDER[DEFAULT_EMBEDDING_PROVIDER]
}
const SUPPORTED_EMBEDDING_PROVIDER_SET = new Set<EmbeddingProviderType>(
  SUPPORTED_EMBEDDING_PROVIDERS
)

const normalizeEmbeddingConfig = (
  config: Partial<EmbeddingConfig> | null | undefined
): EmbeddingConfig => {
  const requestedProvider = config?.provider
  const provider = SUPPORTED_EMBEDDING_PROVIDER_SET.has(requestedProvider as EmbeddingProviderType)
    ? (requestedProvider as EmbeddingProviderType)
    : DEFAULT_EMBEDDING_CONFIG.provider

  const requestedModel =
    typeof config?.model === 'string' && config.model.trim().length > 0
      ? config.model.trim()
      : DEFAULT_EMBEDDING_MODEL_BY_PROVIDER[provider]
  const model = requestedModel

  return {
    provider,
    model
  }
}

const DEFAULT_PLUGIN_PLATFORM_CONFIG: PluginPlatformConfig = {
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
}

const sanitizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return []
  }

  const unique = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') {
      continue
    }

    const normalized = item.trim()
    if (normalized.length > 0) {
      unique.add(normalized)
    }
  }

  return Array.from(unique.values()).sort((a, b) => a.localeCompare(b))
}

const sanitizeExclusiveSlotAssignments = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object') {
    return {}
  }

  const output: Record<string, string> = {}
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof rawValue !== 'string') {
      continue
    }

    const slot = rawKey.trim()
    const pluginId = rawValue.trim()
    if (!slot || !pluginId) {
      continue
    }

    output[slot] = pluginId
  }

  return output
}

const normalizePluginPlatformConfig = (
  config: Partial<PluginPlatformConfig> | null | undefined
): PluginPlatformConfig => {
  const normalizedWorkspaceRoot =
    typeof config?.workspaceRoot === 'string' && config.workspaceRoot.trim().length > 0
      ? config.workspaceRoot.trim()
      : null

  const pluginConfigById =
    config?.pluginConfigById && typeof config.pluginConfigById === 'object'
      ? (config.pluginConfigById as Record<string, unknown>)
      : {}

  return {
    enabled: config?.enabled !== false,
    workspaceRoot: normalizedWorkspaceRoot,
    configuredPluginPaths: sanitizeStringList(config?.configuredPluginPaths),
    enableBundledPlugins: config?.enableBundledPlugins === true,
    allowlist: sanitizeStringList(config?.allowlist),
    denylist: sanitizeStringList(config?.denylist),
    enabledPluginIds: sanitizeStringList(config?.enabledPluginIds),
    disabledPluginIds: sanitizeStringList(config?.disabledPluginIds),
    exclusiveSlotAssignments: sanitizeExclusiveSlotAssignments(config?.exclusiveSlotAssignments),
    pluginConfigById
  }
}

const clonePluginPlatformConfig = (config: PluginPlatformConfig): PluginPlatformConfig => ({
  enabled: config.enabled,
  workspaceRoot: config.workspaceRoot,
  configuredPluginPaths: [...config.configuredPluginPaths],
  enableBundledPlugins: config.enableBundledPlugins,
  allowlist: [...config.allowlist],
  denylist: [...config.denylist],
  enabledPluginIds: [...config.enabledPluginIds],
  disabledPluginIds: [...config.disabledPluginIds],
  exclusiveSlotAssignments: { ...config.exclusiveSlotAssignments },
  pluginConfigById: { ...config.pluginConfigById }
})

// Define a more specific type for what we store in the DB (without API keys)
interface StoredLLMConfig {
  model?: string | null
  endpoint?: string | null
  deploymentName?: string | null
  project?: string | null
  location?: string | null
  baseURL?: string | null
}

interface McpServerConfigRow {
  id: string
  name: string
  url: string | null
  command: string | null
  args: string | null
  enabled: number
}

const mapMcpRowToConfig = (row: McpServerConfigRow): McpServerConfig => ({
  id: row.id,
  name: row.name,
  url: row.url ?? undefined,
  command: row.command ?? undefined,
  args: row.args ? (JSON.parse(row.args) as string[]) : undefined,
  enabled: row.enabled === 1
})

export class SettingsService {
  private db: Database.Database

  constructor() {
    const userDataPath = app.getPath('userData')
    const dbPath = path.join(userDataPath, DB_FILENAME)

    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true })
    }

    this.db = new Database(dbPath)
    this.initializeDatabase()
  }

  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS llm_configs (
        provider TEXT PRIMARY KEY,
        model TEXT,
        endpoint TEXT, 
        deploymentName TEXT,
        project TEXT,
        location TEXT,
        baseURL TEXT
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS mcp_server_configs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT,
        command TEXT,
        args TEXT, -- Stored as JSON string
        enabled INTEGER NOT NULL DEFAULT 1 -- 1 for true, 0 for false
      );
    `)

    // --- Add missing columns to llm_configs if they don't exist (simple migration) ---
    try {
      this.db.exec('ALTER TABLE llm_configs ADD COLUMN project TEXT;')
    } catch (e: unknown) {
      if (!this.isDuplicateColumnError(e)) {
        void 0
      } // Ignore if column already exists
    }
    try {
      this.db.exec('ALTER TABLE llm_configs ADD COLUMN location TEXT;')
    } catch (e: unknown) {
      if (!this.isDuplicateColumnError(e)) {
        void 0
      }
    }
    try {
      this.db.exec('ALTER TABLE llm_configs ADD COLUMN baseURL TEXT;')
    } catch (e: unknown) {
      if (!this.isDuplicateColumnError(e)) {
        void 0
      }
    }
    // --- End simple migration ---

    // Initialize active provider if not set
    const activeProviderRow = this.db
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get('activeLLMProvider') as { value: string } | undefined
    if (!activeProviderRow) {
      this.db
        .prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)')
        .run('activeLLMProvider', JSON.stringify(null))
    }

    // Initialize embedding config if not set, and normalize legacy/invalid values.
    const embeddingConfigRow = this.db
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get(EMBEDDING_CONFIG_KEY) as { value: string } | undefined
    if (!embeddingConfigRow) {
      this.db
        .prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)')
        .run(EMBEDDING_CONFIG_KEY, JSON.stringify(DEFAULT_EMBEDDING_CONFIG))
    } else {
      try {
        const parsed = JSON.parse(embeddingConfigRow.value) as Partial<EmbeddingConfig>
        const normalized = normalizeEmbeddingConfig(parsed)
        if (JSON.stringify(normalized) !== embeddingConfigRow.value) {
          this.db
            .prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
            .run(EMBEDDING_CONFIG_KEY, JSON.stringify(normalized))
        }
      } catch {
        this.db
          .prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
          .run(EMBEDDING_CONFIG_KEY, JSON.stringify(DEFAULT_EMBEDDING_CONFIG))
      }
    }

    // Initialize system prompt config if not set
    const defaultUserSystemPrompt = ''

    const systemPromptRow = this.db
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get('systemPromptConfig') as { value: string } | undefined

    if (!systemPromptRow) {
      const initialConfig: SystemPromptConfig = {
        userSystemPrompt: defaultUserSystemPrompt
      }
      this.db
        .prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)')
        .run('systemPromptConfig', JSON.stringify(initialConfig))
    }

    // Initialize skill pack config if not set
    const skillPackRow = this.db
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get('skillPackConfig') as { value: string } | undefined

    if (!skillPackRow) {
      const initialSkillPackConfig: SkillPackConfig = {
        workspaceRoot: null
      }
      this.db
        .prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)')
        .run('skillPackConfig', JSON.stringify(initialSkillPackConfig))
    }

    const pluginConfigRow = this.db
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get('pluginPlatformConfig') as { value: string } | undefined

    if (!pluginConfigRow) {
      this.db
        .prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)')
        .run('pluginPlatformConfig', JSON.stringify(DEFAULT_PLUGIN_PLATFORM_CONFIG))
    } else {
      try {
        const parsed = JSON.parse(pluginConfigRow.value) as Partial<PluginPlatformConfig>
        const normalized = normalizePluginPlatformConfig(parsed)
        if (JSON.stringify(normalized) !== pluginConfigRow.value) {
          this.db
            .prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
            .run('pluginPlatformConfig', JSON.stringify(normalized))
        }
      } catch {
        this.db
          .prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
          .run('pluginPlatformConfig', JSON.stringify(DEFAULT_PLUGIN_PLATFORM_CONFIG))
      }
    }
  }

  // --- Generic Keytar Helper --- (can be moved to a secure key storage utility later)
  private async setApiKey(provider: LLMProviderType, apiKey: string): Promise<void> {
    await keytar.setPassword(SERVICE_NAME, provider, apiKey)
  }

  private async getApiKey(provider: LLMProviderType): Promise<string | null> {
    return keytar.getPassword(SERVICE_NAME, provider)
  }

  private async deleteApiKey(provider: LLMProviderType): Promise<boolean> {
    return keytar.deletePassword(SERVICE_NAME, provider)
  }

  // --- Provider Specific Setters ---
  async setOpenAIConfig(config: OpenAIConfig): Promise<void> {
    await this.setApiKey('openai', config.apiKey)
    this.db
      .prepare('INSERT OR REPLACE INTO llm_configs (provider, model) VALUES (?, ?)')
      .run('openai', config.model)
  }

  async setGoogleConfig(config: GoogleConfig): Promise<void> {
    await this.setApiKey('google', config.apiKey)
    this.db
      .prepare('INSERT OR REPLACE INTO llm_configs (provider, model) VALUES (?, ?)')
      .run('google', config.model)
  }

  async setAzureConfig(config: AzureConfig): Promise<void> {
    await this.setApiKey('azure', config.apiKey)
    this.db
      .prepare(
        'INSERT OR REPLACE INTO llm_configs (provider, model, endpoint, deploymentName) VALUES (?, ?, ?, ?)'
      )
      .run('azure', null, config.endpoint, config.deploymentName) // model is part of deployment for azure typically
  }

  async setAnthropicConfig(config: AnthropicConfig): Promise<void> {
    await this.setApiKey('anthropic', config.apiKey)
    this.db
      .prepare('INSERT OR REPLACE INTO llm_configs (provider, model) VALUES (?, ?)')
      .run('anthropic', config.model)
  }

  async setVertexConfig(config: VertexConfig): Promise<void> {
    if (config.apiKey) {
      // Vertex apiKey might be the JSON content or a path. Keytar is for secrets.
      // If it's a long JSON string, keytar is fine. If it's a path, it's not a secret itself.
      // For simplicity, we store it if provided. Main process (ChatService) will interpret it.
      await this.setApiKey('vertex', config.apiKey)
    }
    this.db
      .prepare(
        'INSERT OR REPLACE INTO llm_configs (provider, model, project, location, baseURL, endpoint, deploymentName) VALUES (?, ?, ?, ?, NULL, NULL, NULL)'
      )
      .run('vertex', config.model, config.project, config.location)
  }

  async setOllamaConfig(config: OllamaConfig): Promise<void> {
    // Ollama typically does not use an API key managed by keytar
    this.db
      .prepare(
        'INSERT OR REPLACE INTO llm_configs (provider, model, baseURL, project, location, endpoint, deploymentName) VALUES (?, ?, ?, NULL, NULL, NULL, NULL)'
      )
      .run('ollama', config.model, config.baseURL)
  }

  // --- Provider Specific Getters ---
  private async getStoredConfig(provider: LLMProviderType): Promise<StoredLLMConfig | null> {
    const row = this.db
      .prepare(
        'SELECT model, endpoint, deploymentName, project, location, baseURL FROM llm_configs WHERE provider = ?'
      )
      .get(provider) as StoredLLMConfig | undefined
    return row || null
  }

  async getOpenAIConfig(): Promise<OpenAIConfig | null> {
    const apiKey = await this.getApiKey('openai')
    const storedConfig = await this.getStoredConfig('openai')
    if (apiKey && storedConfig?.model) {
      return { apiKey, model: storedConfig.model }
    }
    return null
  }

  async getGoogleConfig(): Promise<GoogleConfig | null> {
    const apiKey = await this.getApiKey('google')
    const storedConfig = await this.getStoredConfig('google')
    if (apiKey && storedConfig?.model) {
      return { apiKey, model: storedConfig.model }
    }
    return null
  }

  async getAzureConfig(): Promise<AzureConfig | null> {
    const apiKey = await this.getApiKey('azure')
    const storedConfig = await this.getStoredConfig('azure')
    if (apiKey && storedConfig?.endpoint && storedConfig?.deploymentName) {
      return {
        apiKey,
        endpoint: storedConfig.endpoint,
        deploymentName: storedConfig.deploymentName
      }
    }
    return null
  }

  async getAnthropicConfig(): Promise<AnthropicConfig | null> {
    const apiKey = await this.getApiKey('anthropic')
    const storedConfig = await this.getStoredConfig('anthropic')
    if (apiKey && storedConfig?.model) {
      return { apiKey, model: storedConfig.model }
    }
    return null
  }

  async getVertexConfig(): Promise<VertexConfig | null> {
    const apiKey = await this.getApiKey('vertex') // This might be null if not set or using ADC
    const storedConfig = await this.getStoredConfig('vertex')
    if (storedConfig?.model && storedConfig.project && storedConfig.location) {
      return {
        apiKey: apiKey, // apiKey can be null here
        model: storedConfig.model,
        project: storedConfig.project,
        location: storedConfig.location
      }
    }
    return null
  }

  async getOllamaConfig(): Promise<OllamaConfig | null> {
    const storedConfig = await this.getStoredConfig('ollama')
    if (storedConfig?.model && storedConfig.baseURL) {
      return { model: storedConfig.model, baseURL: storedConfig.baseURL }
    }
    return null
  }

  async setEmbeddingConfig(config: EmbeddingConfig): Promise<void> {
    const safeConfig = normalizeEmbeddingConfig(config)
    this.db
      .prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
      .run(EMBEDDING_CONFIG_KEY, JSON.stringify(safeConfig))
  }

  async getEmbeddingConfig(): Promise<EmbeddingConfig> {
    const row = this.db
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get(EMBEDDING_CONFIG_KEY) as { value: string } | undefined

    if (!row) {
      return DEFAULT_EMBEDDING_CONFIG
    }

    try {
      const parsed = JSON.parse(row.value) as Partial<EmbeddingConfig>
      return normalizeEmbeddingConfig(parsed)
    } catch {
      return DEFAULT_EMBEDDING_CONFIG
    }
  }

  // --- Active Provider Management ---
  async setActiveLLMProvider(provider: LLMProviderType | null): Promise<void> {
    this.db
      .prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
      .run('activeLLMProvider', JSON.stringify(provider))
  }

  async getActiveLLMProvider(): Promise<LLMProviderType | null> {
    const row = this.db
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get('activeLLMProvider') as { value: string } | undefined
    return row ? JSON.parse(row.value) : null
  }

  // --- Get All Configs (for initial load) ---
  async getAllLLMConfigs(): Promise<AllLLMConfigurations> {
    const [openai, google, azure, anthropic, vertex, ollama, embedding, activeProvider] =
      await Promise.all([
        this.getOpenAIConfig(),
        this.getGoogleConfig(),
        this.getAzureConfig(),
        this.getAnthropicConfig(),
        this.getVertexConfig(),
        this.getOllamaConfig(),
        this.getEmbeddingConfig(),
        this.getActiveLLMProvider()
      ])
    const allConfigs: AllLLMConfigurations = {
      openai: openai || undefined,
      google: google || undefined,
      azure: azure || undefined,
      anthropic: anthropic || undefined,
      vertex: vertex || undefined,
      ollama: ollama || undefined,
      embedding,
      activeProvider: activeProvider || null
    }
    //
    return allConfigs
  }

  // --- MCP Server Configuration Management ---
  async getMcpServerConfigurations(): Promise<McpServerConfig[]> {
    try {
      const rows = this.db
        .prepare('SELECT id, name, url, command, args, enabled FROM mcp_server_configs')
        .all() as McpServerConfigRow[]
      return rows.map(mapMcpRowToConfig)
    } catch {
      return []
    }
  }

  async addMcpServerConfiguration(config: Omit<McpServerConfig, 'id'>): Promise<McpServerConfig> {
    const newId = uuidv4()
    const newConfig: McpServerConfig = { ...config, id: newId }
    {
      this.db
        .prepare(
          'INSERT INTO mcp_server_configs (id, name, url, command, args, enabled) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(
          newConfig.id,
          newConfig.name,
          newConfig.url,
          newConfig.command,
          newConfig.args ? JSON.stringify(newConfig.args) : null,
          newConfig.enabled ? 1 : 0
        )
      return newConfig
    }
  }

  async updateMcpServerConfiguration(
    configId: string,
    updates: Partial<Omit<McpServerConfig, 'id'>>
  ): Promise<McpServerConfig | null> {
    {
      const current = this.db
        .prepare('SELECT * FROM mcp_server_configs WHERE id = ?')
        .get(configId) as McpServerConfigRow | undefined
      if (!current) {
        return null
      }

      const fieldsToUpdate = Object.keys(updates) as Array<keyof Omit<McpServerConfig, 'id'>>
      if (fieldsToUpdate.length === 0) {
        return mapMcpRowToConfig(current) // Return current if no actual updates
      }

      const setClauses = fieldsToUpdate.map((key) => `${key} = ?`).join(', ')
      const values = fieldsToUpdate.map((key) => {
        const value = updates[key]
        if (key === 'args' && value !== undefined) return JSON.stringify(value)
        if (key === 'enabled' && typeof value === 'boolean') return value ? 1 : 0
        return value
      })

      this.db
        .prepare(`UPDATE mcp_server_configs SET ${setClauses} WHERE id = ?`)
        .run(...values, configId)

      const updatedConfigRow = this.db
        .prepare('SELECT * FROM mcp_server_configs WHERE id = ?')
        .get(configId) as McpServerConfigRow
      return mapMcpRowToConfig(updatedConfigRow)
    }
  }

  async deleteMcpServerConfiguration(configId: string): Promise<boolean> {
    try {
      const result = this.db.prepare('DELETE FROM mcp_server_configs WHERE id = ?').run(configId)
      const success = result.changes > 0
      if (success) {
        void 0
      }
      return success
    } catch {
      return false
    }
  }

  // --- Provider Specific Clearers ---
  async clearOpenAIConfig(): Promise<void> {
    await this.deleteApiKey('openai')
    this.db.prepare('DELETE FROM llm_configs WHERE provider = ?').run('openai')
  }

  async clearGoogleConfig(): Promise<void> {
    await this.deleteApiKey('google')
    this.db.prepare('DELETE FROM llm_configs WHERE provider = ?').run('google')
  }

  async clearAzureConfig(): Promise<void> {
    await this.deleteApiKey('azure')
    this.db.prepare('DELETE FROM llm_configs WHERE provider = ?').run('azure')
  }

  async clearAnthropicConfig(): Promise<void> {
    await this.deleteApiKey('anthropic')
    this.db.prepare('DELETE FROM llm_configs WHERE provider = ?').run('anthropic')
  }

  async clearVertexConfig(): Promise<void> {
    await this.deleteApiKey('vertex') // It's okay if this fails if no key was set
    this.db.prepare('DELETE FROM llm_configs WHERE provider = ?').run('vertex')
  }

  async clearOllamaConfig(): Promise<void> {
    // No API key to delete from keytar for Ollama
    this.db.prepare('DELETE FROM llm_configs WHERE provider = ?').run('ollama')
  }

  // --- System Prompt Configuration ---
  async setSystemPromptConfig(config: SystemPromptConfig): Promise<void> {
    {
      this.db
        .prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
        .run('systemPromptConfig', JSON.stringify(config))
    }
  }

  async getSystemPromptConfig(): Promise<SystemPromptConfig> {
    try {
      const row = this.db
        .prepare('SELECT value FROM app_settings WHERE key = ?')
        .get('systemPromptConfig') as { value: string } | undefined

      if (!row) {
        // If no configuration is found, return default values
        const defaultConfig: SystemPromptConfig = {
          userSystemPrompt: ''
        }
        return defaultConfig
      }

      return JSON.parse(row.value) as SystemPromptConfig
    } catch {
      // Return default values if there's an error
      return {
        userSystemPrompt: ''
      }
    }
  }

  // --- Skill Pack Configuration ---
  async setSkillPackConfig(config: SkillPackConfig): Promise<void> {
    {
      this.db
        .prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
        .run('skillPackConfig', JSON.stringify(config))
    }
  }

  async getSkillPackConfig(): Promise<SkillPackConfig> {
    try {
      const row = this.db
        .prepare('SELECT value FROM app_settings WHERE key = ?')
        .get('skillPackConfig') as { value: string } | undefined

      if (!row) {
        return {
          workspaceRoot: null
        }
      }

      const parsed = JSON.parse(row.value) as SkillPackConfig
      return {
        workspaceRoot:
          typeof parsed.workspaceRoot === 'string' && parsed.workspaceRoot.trim().length > 0
            ? parsed.workspaceRoot
            : null
      }
    } catch {
      return {
        workspaceRoot: null
      }
    }
  }

  async setPluginPlatformConfig(config: PluginPlatformConfig): Promise<void> {
    const safeConfig = normalizePluginPlatformConfig(config)
    this.db
      .prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
      .run('pluginPlatformConfig', JSON.stringify(safeConfig))
  }

  async getPluginPlatformConfig(): Promise<PluginPlatformConfig> {
    try {
      const row = this.db
        .prepare('SELECT value FROM app_settings WHERE key = ?')
        .get('pluginPlatformConfig') as { value: string } | undefined

      if (!row) {
        return clonePluginPlatformConfig(DEFAULT_PLUGIN_PLATFORM_CONFIG)
      }

      const parsed = JSON.parse(row.value) as Partial<PluginPlatformConfig>
      return normalizePluginPlatformConfig(parsed)
    } catch {
      return clonePluginPlatformConfig(DEFAULT_PLUGIN_PLATFORM_CONFIG)
    }
  }

  private isDuplicateColumnError(error: unknown): boolean {
    return error instanceof Error && error.message.includes('duplicate column name')
  }
}
