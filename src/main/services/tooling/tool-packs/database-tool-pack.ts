import {
  listDatabaseConnectionsToolDefinition,
  listDatabaseConnectionsToolName,
  type ListDatabaseConnectionsResult
} from '../../../llm-tools/database-tools/list-database-connections-tool'
import type { ToolRegistry } from '../tool-registry'
import type { PostgreSQLService } from '../../postgresql-service'
import { CONNECTION_CREDENTIAL_KEY_PLACEHOLDERS } from '../database-placeholders'

export interface DatabaseToolDependencies {
  getPostgresqlService: () => PostgreSQLService | null
}

export function registerDatabaseTools(registry: ToolRegistry, deps: DatabaseToolDependencies) {
  registry.register({
    name: listDatabaseConnectionsToolName,
    definition: listDatabaseConnectionsToolDefinition,
    category: 'database',
    execute: async () => {
      const postgresqlService = deps.getPostgresqlService()
      if (!postgresqlService) {
        return {
          status: 'error',
          message: 'PostgreSQL Service is not configured.'
        } as ListDatabaseConnectionsResult
      }

      try {
        const connectionIds = await postgresqlService.getActiveConnections()
        const connections = await Promise.all(
          connectionIds.map(async (id) => {
            const info = await postgresqlService.getConnectionInfo(id)
            return {
              id,
              name: id,
              host: CONNECTION_CREDENTIAL_KEY_PLACEHOLDERS.host,
              port: CONNECTION_CREDENTIAL_KEY_PLACEHOLDERS.port,
              database: CONNECTION_CREDENTIAL_KEY_PLACEHOLDERS.database,
              username: CONNECTION_CREDENTIAL_KEY_PLACEHOLDERS.username,
              password: CONNECTION_CREDENTIAL_KEY_PLACEHOLDERS.password,
              ssl: CONNECTION_CREDENTIAL_KEY_PLACEHOLDERS.ssl,
              connected: info.connected
            }
          })
        )

        const placeholderNote =
          'PLACEHOLDER NOTE: The host/port/db_name/username/password/ssl values shown here are placeholder tokens and this tool is for discovery only. Repeat the placeholder names exactly (use db_name for the database) when calling other database tools and Arion will inject the real credentials automatically.'

        return {
          status: 'success',
          connections,
          message: `Found ${connections.length} database connection(s). This list is for discovery and does not by itself connect or authorize queries. Use the connection_id and the placeholder field names (host, port, db_name, username, password, ssl) when calling tools that interact with a Postgres database. Credential values stay hidden and are injected automatically when the tool runs.`,
          placeholder_note: placeholderNote
        } as ListDatabaseConnectionsResult
      } catch (error) {
        return {
          status: 'error',
          message: `Error listing database connections: ${error instanceof Error ? error.message : 'Unknown error'}.`
        } as ListDatabaseConnectionsResult
      }
    }
  })
}
