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
  console.log('[PostgreSQL IPC Handlers] Registering PostgreSQL IPC handlers')

  // Test PostgreSQL connection
  ipcMain.handle(
    IpcChannels.postgresqlTestConnection,
    async (_event, config: PostgreSQLConfig): Promise<PostgreSQLConnectionResult> => {
      console.log('[PostgreSQL IPC] Received test connection request')
      try {
        return await postgresqlService.testConnection(config)
      } catch (error) {
        console.error('[PostgreSQL IPC] Test connection failed:', error)
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
      console.log(`[PostgreSQL IPC] Received create connection request for ${id}`)
      try {
        return await postgresqlService.createConnection(id, config)
      } catch (error) {
        console.error(`[PostgreSQL IPC] Create connection failed for ${id}:`, error)
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Unknown error during connection creation'
        }
      }
    }
  )

  // Close PostgreSQL connection
  ipcMain.handle(
    IpcChannels.postgresqlCloseConnection,
    async (_event, id: string): Promise<void> => {
      console.log(`[PostgreSQL IPC] Received close connection request for ${id}`)
      try {
        await postgresqlService.closeConnection(id)
      } catch (error) {
        console.error(`[PostgreSQL IPC] Close connection failed for ${id}:`, error)
        // Don't throw here as this is cleanup
      }
    }
  )

  // Execute PostgreSQL query
  ipcMain.handle(
    IpcChannels.postgresqlExecuteQuery,
    async (_event, id: string, query: string, params?: any[]): Promise<PostgreSQLQueryResult> => {
      console.log(`[PostgreSQL IPC] Received execute query request for ${id}`)
      try {
        return await postgresqlService.executeQuery(id, query, params)
      } catch (error) {
        console.error(`[PostgreSQL IPC] Execute query failed for ${id}:`, error)
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
      console.log(`[PostgreSQL IPC] Received execute transaction request for ${id}`)
      try {
        return await postgresqlService.executeTransaction(id, queries)
      } catch (error) {
        console.error(`[PostgreSQL IPC] Execute transaction failed for ${id}:`, error)
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Unknown error during transaction execution'
        }
      }
    }
  )

  // Get active PostgreSQL connections
  ipcMain.handle(
    IpcChannels.postgresqlGetActiveConnections,
    async (_event): Promise<string[]> => {
      console.log('[PostgreSQL IPC] Received get active connections request')
      try {
        return await postgresqlService.getActiveConnections()
      } catch (error) {
        console.error('[PostgreSQL IPC] Get active connections failed:', error)
        return []
      }
    }
  )

  // Get PostgreSQL connection info
  ipcMain.handle(
    IpcChannels.postgresqlGetConnectionInfo,
    async (_event, id: string): Promise<PostgreSQLConnectionInfo> => {
      console.log(`[PostgreSQL IPC] Received get connection info request for ${id}`)
      try {
        return await postgresqlService.getConnectionInfo(id)
      } catch (error) {
        console.error(`[PostgreSQL IPC] Get connection info failed for ${id}:`, error)
        return { connected: false }
      }
    }
  )

  console.log('[PostgreSQL IPC Handlers] All PostgreSQL IPC handlers registered successfully')
}