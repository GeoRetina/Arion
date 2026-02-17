import { type IpcMain } from 'electron'
import {
  IpcChannels,
  PostgreSQLConfig,
  PostgreSQLConnectionResult,
  PostgreSQLQueryResult,
  PostgreSQLConnectionInfo
} from '../../shared/ipc-types'
import { type PostgreSQLService } from '../services/postgresql-service'

export function registerPostgreSQLIpcHandlers(
  ipcMain: IpcMain,
  postgresqlService: PostgreSQLService
): void {
  // Test PostgreSQL connection
  ipcMain.handle(
    IpcChannels.postgresqlTestConnection,
    async (_event, config: PostgreSQLConfig): Promise<PostgreSQLConnectionResult> => {
      try {
        return await postgresqlService.testConnection(config)
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
        return await postgresqlService.createConnection(id, config)
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
        await postgresqlService.closeConnection(id)
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
        return await postgresqlService.executeQuery(id, query, params)
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
        return await postgresqlService.executeTransaction(id, queries)
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
        return await postgresqlService.getConnectionInfo(id)
      } catch {
        return { connected: false }
      }
    }
  )
}
