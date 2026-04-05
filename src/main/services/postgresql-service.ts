import { Pool, PoolClient, QueryResult } from 'pg'
import * as keytar from 'keytar'
import {
  PostgreSQLConfig,
  PostgreSQLConfigForRenderer,
  PostgreSQLConnectionResult,
  PostgreSQLQueryResult
} from '../../shared/ipc-types'

const POSTGRESQL_CREDENTIAL_SERVICE_NAME = 'ArionPostgreSQLCredentials'

export class PostgreSQLService {
  private pools: Map<string, Pool> = new Map()
  private restorePromises: Map<string, Promise<PostgreSQLConnectionResult>> = new Map()
  private readonly maxConnections = 10
  private readonly connectionTimeout = 30000
  private readonly idleTimeout = 30000

  constructor() {
    void 0
  }

  async testConnection(config: PostgreSQLConfig): Promise<PostgreSQLConnectionResult> {
    const tempPool = this.createPool(config, 1)

    try {
      return await this.probePool(tempPool, 'Connection successful')
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown connection error'
      }
    } finally {
      await tempPool.end().catch(() => {
        void 0
      })
    }
  }

  async createConnection(
    id: string,
    config: PostgreSQLConfig
  ): Promise<PostgreSQLConnectionResult> {
    let candidatePool: Pool | null = null

    try {
      candidatePool = this.createPool(config, this.maxConnections)
      const testResult = await this.probePool(candidatePool, 'Connection pool created successfully')
      if (!testResult.success) {
        return testResult
      }

      await this.storeCredentials(id, config)
      await this.closePool(id)
      this.pools.set(id, candidatePool)
      candidatePool = null

      return testResult
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error creating connection'
      }
    } finally {
      if (candidatePool) {
        await candidatePool.end().catch(() => {
          void 0
        })
      }
    }
  }

  async closeConnection(id: string): Promise<void> {
    await this.closePool(id)
    await this.removeCredentials(id)
  }

  async executeQuery(
    id: string,
    query: string,
    params?: unknown[]
  ): Promise<PostgreSQLQueryResult> {
    const pool = await this.ensureConnection(id)
    if (!pool) {
      return {
        success: false,
        message: `No active connection found for ${id}`
      }
    }

    let client: PoolClient | null = null

    try {
      client = await pool.connect()

      const startTime = Date.now()
      const result: QueryResult = await client.query(query, params)
      const executionTime = Date.now() - startTime

      return {
        success: true,
        rows: result.rows,
        rowCount: result.rowCount || 0,
        fields:
          result.fields?.map((field) => ({
            name: field.name,
            dataTypeID: field.dataTypeID,
            dataTypeSize: field.dataTypeSize,
            dataTypeModifier: field.dataTypeModifier,
            format: field.format
          })) || [],
        executionTime,
        message: `Query executed successfully in ${executionTime}ms`
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown query execution error'
      }
    } finally {
      if (client) {
        client.release()
      }
    }
  }

  async executeTransaction(id: string, queries: string[]): Promise<PostgreSQLQueryResult> {
    const pool = await this.ensureConnection(id)
    if (!pool) {
      return {
        success: false,
        message: `No active connection found for ${id}`
      }
    }

    let client: PoolClient | null = null

    try {
      client = await pool.connect()

      const startTime = Date.now()
      await client.query('BEGIN')

      const results: unknown[][] = []
      for (const query of queries) {
        const result = await client.query(query)
        results.push(result.rows)
      }

      await client.query('COMMIT')
      const executionTime = Date.now() - startTime

      return {
        success: true,
        rows: results,
        rowCount: results.reduce((sum: number, rows) => sum + rows.length, 0),
        fields: [],
        executionTime,
        message: `Transaction executed successfully in ${executionTime}ms`
      }
    } catch (error) {
      if (client) {
        try {
          await client.query('ROLLBACK')
        } catch {
          void 0
        }
      }

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown transaction error'
      }
    } finally {
      if (client) {
        client.release()
      }
    }
  }

  async getActiveConnections(): Promise<string[]> {
    return Array.from(this.pools.keys())
  }

  async getConnectionInfo(id: string): Promise<{ connected: boolean; config?: PostgreSQLConfig }> {
    const pool = await this.ensureConnection(id)
    if (!pool) {
      return { connected: false }
    }

    try {
      const config = await this.readStoredCredentials(id)
      return {
        connected: true,
        config: config || undefined
      }
    } catch {
      return { connected: false }
    }
  }

  async getConnectionInfoForRenderer(
    id: string
  ): Promise<{ connected: boolean; config?: PostgreSQLConfigForRenderer }> {
    const connectionInfo = await this.getConnectionInfo(id)
    if (!connectionInfo.connected || !connectionInfo.config) {
      return { connected: false }
    }

    return {
      connected: true,
      config: {
        host: connectionInfo.config.host,
        port: connectionInfo.config.port,
        database: connectionInfo.config.database,
        username: connectionInfo.config.username,
        ssl: connectionInfo.config.ssl,
        hasPassword:
          typeof connectionInfo.config.password === 'string' &&
          connectionInfo.config.password.trim().length > 0
      }
    }
  }

  async getSavedCredentials(id: string): Promise<PostgreSQLConfig | null> {
    return this.readStoredCredentials(id)
  }

  async restoreConnection(id: string): Promise<PostgreSQLConnectionResult> {
    const activePool = this.pools.get(id)
    if (activePool) {
      return {
        success: true,
        message: `Connection for ${id} is already active`
      }
    }

    const pendingRestore = this.restorePromises.get(id)
    if (pendingRestore) {
      return pendingRestore
    }

    const restorePromise = this.restoreConnectionInternal(id).finally(() => {
      this.restorePromises.delete(id)
    })

    this.restorePromises.set(id, restorePromise)
    return restorePromise
  }

  private async storeCredentials(id: string, config: PostgreSQLConfig): Promise<void> {
    {
      const credentialsKey = `${POSTGRESQL_CREDENTIAL_SERVICE_NAME}_${id}`
      const credentials = JSON.stringify({
        host: config.host,
        port: config.port,
        database: config.database,
        username: config.username,
        password: config.password,
        ssl: config.ssl
      })

      await keytar.setPassword(POSTGRESQL_CREDENTIAL_SERVICE_NAME, credentialsKey, credentials)
    }
  }

  private async readStoredCredentials(id: string): Promise<PostgreSQLConfig | null> {
    try {
      const credentialsKey = `${POSTGRESQL_CREDENTIAL_SERVICE_NAME}_${id}`
      const credentials = await keytar.getPassword(
        POSTGRESQL_CREDENTIAL_SERVICE_NAME,
        credentialsKey
      )

      if (!credentials) {
        return null
      }

      return JSON.parse(credentials) as PostgreSQLConfig
    } catch {
      return null
    }
  }

  private async removeCredentials(id: string): Promise<void> {
    try {
      const credentialsKey = `${POSTGRESQL_CREDENTIAL_SERVICE_NAME}_${id}`
      await keytar.deletePassword(POSTGRESQL_CREDENTIAL_SERVICE_NAME, credentialsKey)
    } catch {
      void 0
    }
  }

  private createPool(config: PostgreSQLConfig, max: number): Pool {
    return new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max,
      connectionTimeoutMillis: this.connectionTimeout,
      idleTimeoutMillis: this.idleTimeout
    })
  }

  private async probePool(pool: Pool, successMessage: string): Promise<PostgreSQLConnectionResult> {
    let client: PoolClient | null = null

    try {
      client = await pool.connect()

      const result = await client.query('SELECT version()')
      const version = result.rows[0]?.version || 'Unknown'

      let postgisVersion: string | null = null
      try {
        const postgisResult = await client.query('SELECT PostGIS_Version()')
        postgisVersion = postgisResult.rows[0]?.postgis_version || null
      } catch {
        void 0
      }

      return {
        success: true,
        version,
        postgisVersion,
        message: successMessage
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown connection error'
      }
    } finally {
      if (client) {
        client.release()
      }
    }
  }

  private async restoreConnectionInternal(id: string): Promise<PostgreSQLConnectionResult> {
    const config = await this.readStoredCredentials(id)
    if (!config) {
      return {
        success: false,
        message: `No saved credentials found for ${id}`
      }
    }

    let candidatePool: Pool | null = null

    try {
      candidatePool = this.createPool(config, this.maxConnections)
      const restoreResult = await this.probePool(candidatePool, 'Connection restored successfully')
      if (!restoreResult.success) {
        return restoreResult
      }

      await this.closePool(id)
      this.pools.set(id, candidatePool)
      candidatePool = null
      return restoreResult
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error restoring connection'
      }
    } finally {
      if (candidatePool) {
        await candidatePool.end().catch(() => {
          void 0
        })
      }
    }
  }

  private async ensureConnection(id: string): Promise<Pool | null> {
    const activePool = this.pools.get(id)
    if (activePool) {
      return activePool
    }

    const restoreResult = await this.restoreConnection(id)
    if (!restoreResult.success) {
      return null
    }

    return this.pools.get(id) || null
  }

  private async closePool(id: string): Promise<void> {
    const pool = this.pools.get(id)
    if (!pool) {
      return
    }

    this.pools.delete(id)

    try {
      await pool.end()
    } catch {
      void 0
    }
  }

  async cleanup(): Promise<void> {
    for (const [, pool] of this.pools) {
      try {
        await pool.end()
      } catch {
        void 0
      }
    }

    this.pools.clear()
  }
}
