import type Database from 'better-sqlite3'
import type {
  ConnectorPolicyConfig,
  EmbeddingConfig,
  PluginPlatformConfig,
  SkillPackConfig
} from '../../../shared/ipc-types'
import {
  DEFAULT_EMBEDDING_CONFIG,
  DEFAULT_NORMALIZED_CONNECTOR_POLICY_CONFIG,
  DEFAULT_PLUGIN_PLATFORM_CONFIG,
  DEFAULT_SKILL_PACK_CONFIG,
  DEFAULT_SYSTEM_PROMPT_CONFIG,
  EMBEDDING_CONFIG_KEY,
  normalizeEmbeddingConfig,
  normalizePluginPlatformConfig,
  normalizeSkillPackConfig
} from './settings-service-config'
import { normalizeConnectorPolicyConfig } from '../connectors/policy/connector-policy-config'

interface AppSettingRow {
  value: string
}

const isDuplicateColumnError = (error: unknown): boolean => {
  return error instanceof Error && error.message.includes('duplicate column name')
}

const ensureRawJsonSetting = (db: Database.Database, key: string, value: unknown): void => {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | AppSettingRow
    | undefined

  if (!row) {
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(
      key,
      JSON.stringify(value)
    )
  }
}

const ensureNormalizedJsonSetting = <TInput, TOutput>(
  db: Database.Database,
  key: string,
  fallbackValue: TOutput,
  normalize: (input: TInput) => TOutput
): void => {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | AppSettingRow
    | undefined

  if (!row) {
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(
      key,
      JSON.stringify(fallbackValue)
    )
    return
  }

  try {
    const parsed = JSON.parse(row.value) as TInput
    const normalized = normalize(parsed)
    if (JSON.stringify(normalized) !== row.value) {
      db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(
        key,
        JSON.stringify(normalized)
      )
    }
  } catch {
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(
      key,
      JSON.stringify(fallbackValue)
    )
  }
}

export const initializeSettingsDatabase = (db: Database.Database): void => {
  db.exec(`
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

  try {
    db.exec('ALTER TABLE llm_configs ADD COLUMN project TEXT;')
  } catch (error: unknown) {
    if (!isDuplicateColumnError(error)) {
      void 0
    }
  }

  try {
    db.exec('ALTER TABLE llm_configs ADD COLUMN location TEXT;')
  } catch (error: unknown) {
    if (!isDuplicateColumnError(error)) {
      void 0
    }
  }

  try {
    db.exec('ALTER TABLE llm_configs ADD COLUMN baseURL TEXT;')
  } catch (error: unknown) {
    if (!isDuplicateColumnError(error)) {
      void 0
    }
  }

  ensureRawJsonSetting(db, 'activeLLMProvider', null)
  ensureNormalizedJsonSetting<Partial<EmbeddingConfig>, EmbeddingConfig>(
    db,
    EMBEDDING_CONFIG_KEY,
    DEFAULT_EMBEDDING_CONFIG,
    normalizeEmbeddingConfig
  )
  ensureRawJsonSetting(db, 'systemPromptConfig', DEFAULT_SYSTEM_PROMPT_CONFIG)
  ensureNormalizedJsonSetting<Partial<SkillPackConfig>, SkillPackConfig>(
    db,
    'skillPackConfig',
    normalizeSkillPackConfig(DEFAULT_SKILL_PACK_CONFIG),
    normalizeSkillPackConfig
  )
  ensureNormalizedJsonSetting<Partial<PluginPlatformConfig>, PluginPlatformConfig>(
    db,
    'pluginPlatformConfig',
    DEFAULT_PLUGIN_PLATFORM_CONFIG,
    normalizePluginPlatformConfig
  )
  ensureNormalizedJsonSetting<Partial<ConnectorPolicyConfig>, ConnectorPolicyConfig>(
    db,
    'connectorPolicyConfig',
    DEFAULT_NORMALIZED_CONNECTOR_POLICY_CONFIG,
    normalizeConnectorPolicyConfig
  )
}
