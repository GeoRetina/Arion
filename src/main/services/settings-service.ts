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
  LLMProviderType,
  AllLLMConfigurations,
  McpServerConfig,
  SystemPromptConfig
} from '../../shared/ipc-types'

const SERVICE_NAME = 'ArionLLMCredentials'
const DB_FILENAME = 'arion-settings.db'

// Define a more specific type for what we store in the DB (without API keys)
interface StoredLLMConfig {
  model?: string | null
  endpoint?: string | null
  deploymentName?: string | null
  project?: string | null
  location?: string | null
  baseURL?: string | null
}

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
    } catch (e: any) {
      if (!e.message.includes('duplicate column name')) {
        void 0
      } // Ignore if column already exists
    }
    try {
      this.db.exec('ALTER TABLE llm_configs ADD COLUMN location TEXT;')
    } catch (e: any) {
      if (!e.message.includes('duplicate column name')) {
        void 0
      }
    }
    try {
      this.db.exec('ALTER TABLE llm_configs ADD COLUMN baseURL TEXT;')
    } catch (e: any) {
      if (!e.message.includes('duplicate column name')) {
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
    const [openai, google, azure, anthropic, vertex, ollama, activeProvider] = await Promise.all([
      this.getOpenAIConfig(),
      this.getGoogleConfig(),
      this.getAzureConfig(),
      this.getAnthropicConfig(),
      this.getVertexConfig(),
      this.getOllamaConfig(),
      this.getActiveLLMProvider()
    ])
    const allConfigs: AllLLMConfigurations = {
      openai: openai || undefined,
      google: google || undefined,
      azure: azure || undefined,
      anthropic: anthropic || undefined,
      vertex: vertex || undefined,
      ollama: ollama || undefined,
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
        .all() as any[]
      return rows.map((row) => ({
        ...row,
        args: row.args ? JSON.parse(row.args) : undefined,
        enabled: row.enabled === 1
      }))
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
        .get(configId) as McpServerConfig | undefined
      if (!current) {
        return null
      }

      const fieldsToUpdate = Object.keys(updates).filter((key) => key !== 'id')
      if (fieldsToUpdate.length === 0) {
        return {
          ...current,
          args: current.args ? JSON.parse(current.args as any) : undefined,
          enabled: current.enabled === (1 as any)
        } // Return current if no actual updates
      }

      const setClauses = fieldsToUpdate.map((key) => `${key} = ?`).join(', ')
      const values = fieldsToUpdate.map((key) => {
        const value = (updates as any)[key]
        if (key === 'args' && value !== undefined) return JSON.stringify(value)
        if (key === 'enabled' && typeof value === 'boolean') return value ? 1 : 0
        return value
      })

      this.db
        .prepare(`UPDATE mcp_server_configs SET ${setClauses} WHERE id = ?`)
        .run(...values, configId)

      const updatedConfigRow = this.db
        .prepare('SELECT * FROM mcp_server_configs WHERE id = ?')
        .get(configId) as any
      return {
        ...updatedConfigRow,
        args: updatedConfigRow.args ? JSON.parse(updatedConfigRow.args) : undefined,
        enabled: updatedConfigRow.enabled === 1
      }
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
}
