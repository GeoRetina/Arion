import { type IpcMain } from 'electron'
import {
  IpcChannels,
  PostgreSQLConfig,
  PostgreSQLConnectionResult,
  PostgreSQLQueryResult,
  PostgreSQLConnectionInfo
} from '../../shared/ipc-types'
import { type PostgreSQLService } from '../services/postgresql-service'
import { z } from 'zod'

const connectionIdSchema = z.string().trim().min(1).max(256)
const postgresqlConfigSchema = z
  .object({
    host: z.string().trim().min(1).max(512),
    port: z.number().int().min(1).max(65535),
    database: z.string().trim().min(1).max(512),
    username: z.string().trim().min(1).max(512),
    password: z.string().trim().min(1).max(4096),
    ssl: z.boolean()
  })
  .strict()
const querySchema = z.string().trim().min(1).max(1_000_000)
const queryParamsSchema = z.array(z.unknown()).max(10_000).optional()
const transactionQueriesSchema = z.array(querySchema).min(1).max(1_000)

export function registerPostgreSQLIpcHandlers(
  ipcMain: IpcMain,
  postgresqlService: PostgreSQLService
): void {
  // Test PostgreSQL connection
  ipcMain.handle(
    IpcChannels.postgresqlTestConnection,
    async (_event, config: PostgreSQLConfig): Promise<PostgreSQLConnectionResult> => {
      try {
        const parsedConfig = postgresqlConfigSchema.parse(config)
        return await postgresqlService.testConnection(parsedConfig)
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Unknown error during connection test'
        }
      }
    }
  )

  // Create PostgreSQL connection
  ipcMain.handle(
    IpcChannels.postgresqlCreateConnection,
    async (_event, id: string, config: PostgreSQLConfig): Promise<PostgreSQLConnectionResult> => {
      try {
        const parsedId = connectionIdSchema.parse(id)
        const parsedConfig = postgresqlConfigSchema.parse(config)
        return await postgresqlService.createConnection(parsedId, parsedConfig)
      } catch (error) {
        return {
          success: false,
          message:
            error instanceof Error ? error.message : 'Unknown error during connection creation'
        }
      }
    }
  )

  // Close PostgreSQL connection
  ipcMain.handle(
    IpcChannels.postgresqlCloseConnection,
    async (_event, id: string): Promise<void> => {
      try {
        const parsedId = connectionIdSchema.parse(id)
        await postgresqlService.closeConnection(parsedId)
      } catch {
        // Don't throw here as this is cleanup
      }
    }
  )

  // Execute PostgreSQL query
  ipcMain.handle(
    IpcChannels.postgresqlExecuteQuery,
    async (
      _event,
      id: string,
      query: string,
      params?: unknown[]
    ): Promise<PostgreSQLQueryResult> => {
      try {
        const parsedId = connectionIdSchema.parse(id)
        const parsedQuery = querySchema.parse(query)
        const parsedParams = queryParamsSchema.parse(params)
        return await postgresqlService.executeQuery(parsedId, parsedQuery, parsedParams)
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Unknown error during query execution'
        }
      }
    }
  )

  // Execute PostgreSQL transaction
  ipcMain.handle(
    IpcChannels.postgresqlExecuteTransaction,
    async (_event, id: string, queries: string[]): Promise<PostgreSQLQueryResult> => {
      try {
        const parsedId = connectionIdSchema.parse(id)
        const parsedQueries = transactionQueriesSchema.parse(queries)
        return await postgresqlService.executeTransaction(parsedId, parsedQueries)
      } catch (error) {
        return {
          success: false,
          message:
            error instanceof Error ? error.message : 'Unknown error during transaction execution'
        }
      }
    }
  )

  // Get active PostgreSQL connections
  ipcMain.handle(IpcChannels.postgresqlGetActiveConnections, async (): Promise<string[]> => {
    try {
      return await postgresqlService.getActiveConnections()
    } catch {
      return []
    }
  })

  // Get PostgreSQL connection info
  ipcMain.handle(
    IpcChannels.postgresqlGetConnectionInfo,
    async (_event, id: string): Promise<PostgreSQLConnectionInfo> => {
      try {
        const parsedId = connectionIdSchema.parse(id)
        return await postgresqlService.getConnectionInfoForRenderer(parsedId)
      } catch {
        return { connected: false }
      }
    }
  )
}
