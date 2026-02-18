import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import {
  SUPPORTED_INTEGRATION_IDS,
  type IntegrationConfig,
  type IntegrationConfigMap,
  type IntegrationDisconnectResult,
  type IntegrationHealthCheckResult,
  type IntegrationId,
  type IntegrationStateRecord,
  type IntegrationStatus
} from '../../shared/ipc-types'
import type { PostgreSQLService } from './postgresql-service'
import { DB_FILENAME } from './connectors/constants'
import {
  splitPublicAndSecretConfig,
  validateIntegrationConfig,
  validateIntegrationId
} from './connectors/schemas'
import { IntegrationSecretStore } from './connectors/secret-store'
import { IntegrationStateStore, type IntegrationConfigRow } from './connectors/state-store'
import { runIntegrationHealthCheck } from './connectors/health-checks/runner'
import { createHealthCheckResult } from './connectors/health-checks/result'
import { hasMeaningfulConfig, parseJsonRecord } from './connectors/utils'

export class ConnectorHubService {
  private readonly stateStore: IntegrationStateStore
  private readonly secretStore: IntegrationSecretStore
  private readonly postgresqlService: PostgreSQLService

  constructor(postgresqlService: PostgreSQLService) {
    const userDataPath = app.getPath('userData')
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true })
    }

    const dbPath = path.join(userDataPath, DB_FILENAME)
    this.stateStore = new IntegrationStateStore(dbPath)
    this.secretStore = new IntegrationSecretStore()
    this.postgresqlService = postgresqlService
  }

  public validateIntegrationId(rawId: string): IntegrationId {
    return validateIntegrationId(rawId)
  }

  public async getStates(): Promise<IntegrationStateRecord[]> {
    const rows = this.stateStore.getAllRows()
    const rowById = new Map(rows.map((row) => [row.id, row]))

    return SUPPORTED_INTEGRATION_IDS.map((id): IntegrationStateRecord => {
      const row = rowById.get(id)
      if (!row) {
        return {
          id,
          status: 'not-configured',
          lastUsed: 'Never',
          hasConfig: false
        }
      }

      return {
        id,
        status: row.status,
        lastUsed: row.last_used || 'Never',
        hasConfig: row.has_config === 1,
        message: row.message || undefined,
        checkedAt: row.checked_at || undefined
      }
    })
  }

  public async getConfig<T extends IntegrationId>(id: T): Promise<IntegrationConfigMap[T] | null> {
    const mergedConfig = await this.getStoredRawConfig(id)
    if (!mergedConfig) {
      return null
    }

    try {
      return validateIntegrationConfig(id, mergedConfig) as IntegrationConfigMap[T]
    } catch (error) {
      console.warn(`[IntegrationHub] Returning stored partial config for ${id}:`, error)
      return mergedConfig as unknown as IntegrationConfigMap[T]
    }
  }

  public async saveConfig(id: IntegrationId, rawConfig: unknown): Promise<void> {
    const validatedConfig = validateIntegrationConfig(id, rawConfig)
    const configObject = validatedConfig as unknown as Record<string, unknown>
    const split = splitPublicAndSecretConfig(id, configObject)
    await this.secretStore.setSecretConfig(id, split.secretConfig)

    const existing = this.stateStore.getRowById(id)
    const hasConfig = hasMeaningfulConfig(configObject)
    const nextStatus: IntegrationStatus = hasConfig
      ? existing?.status === 'connected'
        ? 'connected'
        : 'disconnected'
      : 'not-configured'

    this.stateStore.upsertRow({
      id,
      status: nextStatus,
      lastUsed: existing?.last_used || 'Never',
      message: existing?.message || null,
      checkedAt: existing?.checked_at || null,
      hasConfig,
      publicConfig: split.publicConfig
    })
  }

  public async testConnection(
    id: IntegrationId,
    rawConfig?: unknown
  ): Promise<IntegrationHealthCheckResult> {
    const config = await this.resolveConfigForCheck(id, rawConfig)
    if (!config) {
      return createHealthCheckResult(false, 'not-configured', 'Integration is not configured')
    }
    return runIntegrationHealthCheck(id, config, 'test', this.postgresqlService)
  }

  public async connect(
    id: IntegrationId,
    rawConfig?: unknown
  ): Promise<IntegrationHealthCheckResult> {
    let config: IntegrationConfig | null = null
    try {
      if (rawConfig) {
        config = validateIntegrationConfig(id, rawConfig)
        await this.saveConfig(id, config)
      } else {
        config = await this.getConfig(id)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to validate configuration'
      const result = createHealthCheckResult(false, 'error', message)
      this.persistConnectionState(id, 'error', message, undefined)
      return result
    }

    if (!config) {
      const result = createHealthCheckResult(
        false,
        'not-configured',
        'Integration is not configured'
      )
      this.persistConnectionState(id, 'not-configured', result.message, undefined)
      return result
    }

    const result = await runIntegrationHealthCheck(id, config, 'connect', this.postgresqlService)
    if (result.success) {
      this.persistConnectionState(id, 'connected', result.message, new Date().toLocaleString())
      return {
        ...result,
        status: 'connected'
      }
    }

    this.persistConnectionState(id, 'error', result.message, undefined)
    return {
      ...result,
      status: 'error'
    }
  }

  public async disconnect(id: IntegrationId): Promise<IntegrationDisconnectResult> {
    if (id === 'postgresql-postgis') {
      try {
        await this.postgresqlService.closeConnection(id)
      } catch (error) {
        console.error('[IntegrationHub] Failed to close PostgreSQL connection:', error)
      }
    }

    this.persistConnectionState(id, 'disconnected', 'Disconnected', undefined)
    return {
      success: true,
      message: 'Disconnected'
    }
  }

  public cleanup(): void {
    this.stateStore.close()
  }

  private persistConnectionState(
    id: IntegrationId,
    status: IntegrationStatus,
    message: string,
    lastUsed: string | undefined
  ): void {
    const existing = this.stateStore.getRowById(id)
    this.stateStore.upsertRow({
      id,
      status,
      lastUsed: lastUsed || existing?.last_used || 'Never',
      message,
      checkedAt: new Date().toISOString(),
      hasConfig: existing?.has_config === 1,
      publicConfig: existing ? parseJsonRecord(existing.public_config) : {}
    })
  }

  private async resolveConfigForCheck(
    id: IntegrationId,
    rawConfig?: unknown
  ): Promise<IntegrationConfig | null> {
    if (rawConfig) {
      return validateIntegrationConfig(id, rawConfig)
    }
    const storedConfig = await this.getStoredRawConfig(id)
    if (!storedConfig) {
      return null
    }

    try {
      return validateIntegrationConfig(id, storedConfig)
    } catch (error) {
      console.error(`[IntegrationHub] Stored config for ${id} is incomplete:`, error)
      return null
    }
  }

  private async getStoredRawConfig(id: IntegrationId): Promise<Record<string, unknown> | null> {
    const row = this.stateStore.getRowById(id)
    if (!row || row.has_config !== 1) {
      return null
    }

    const publicConfig = parseJsonRecord(row.public_config)
    let secretConfig: Record<string, unknown> = {}
    try {
      secretConfig = await this.secretStore.getSecretConfig(id)
    } catch (error) {
      console.error(`[IntegrationHub] Failed to read secrets for ${id}:`, error)
    }

    if (id === 'postgresql-postgis') {
      try {
        const fallback = await this.postgresqlService.getSavedCredentials(id)
        if (fallback) {
          const publicFallback: Record<string, unknown> = {
            host: fallback.host,
            port: fallback.port,
            database: fallback.database,
            username: fallback.username,
            ssl: fallback.ssl
          }

          for (const [key, value] of Object.entries(publicFallback)) {
            const current = publicConfig[key]
            const isMissing =
              current === undefined ||
              current === null ||
              (typeof current === 'string' && current.trim().length === 0)
            if (isMissing) {
              publicConfig[key] = value
            }
          }

          const currentPassword = secretConfig.password
          const hasPassword =
            typeof currentPassword === 'string' && currentPassword.trim().length > 0
          if (
            !hasPassword &&
            typeof fallback.password === 'string' &&
            fallback.password.length > 0
          ) {
            secretConfig.password = fallback.password
          }
        }
      } catch (error) {
        console.error('[IntegrationHub] Failed to load PostgreSQL credential fallback:', error)
      }
    }

    const mergedConfig = { ...publicConfig, ...secretConfig }
    if (Object.keys(mergedConfig).length === 0) {
      return null
    }

    return mergedConfig
  }
}

export type { IntegrationConfigRow }
