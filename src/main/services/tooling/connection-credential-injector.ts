import type { PostgreSQLService } from '../postgresql-service'
import { CONNECTION_PLACEHOLDER_LOOKUP } from './database-placeholders'

export class ConnectionCredentialInjector {
  private postgresqlService: PostgreSQLService | null = null

  public setPostgresqlService(service: PostgreSQLService | null) {
    this.postgresqlService = service
  }

  public async inject(args: any): Promise<any> {
    if (!args || typeof args !== 'object' || args === null) {
      return args
    }

    const rawConnectionId = args.connection_id
    if (typeof rawConnectionId !== 'string' || rawConnectionId.trim().length === 0) {
      return args
    }

    if (!this.postgresqlService) {
      throw new Error(
        `Cannot resolve database connection "${rawConnectionId}" because the PostgreSQL service is not configured.`
      )
    }

    const connectionInfo = await this.postgresqlService.getConnectionInfo(rawConnectionId)
    if (!connectionInfo.connected || !connectionInfo.config) {
      throw new Error(
        `Database connection "${rawConnectionId}" is not active. Use the Arion UI to establish the connection before invoking this tool.`
      )
    }

    const enrichedArgs = { ...args }
    const credentials = {
      host: connectionInfo.config.host,
      port: connectionInfo.config.port,
      database: connectionInfo.config.database,
      username: connectionInfo.config.username,
      password: connectionInfo.config.password,
      ssl: connectionInfo.config.ssl ?? false
    }

    Object.entries(credentials).forEach(([key, value]) => {
      if (value === undefined) {
        return
      }

      const currentValue = enrichedArgs[key]
      const placeholderSet =
        CONNECTION_PLACEHOLDER_LOOKUP[key as keyof typeof CONNECTION_PLACEHOLDER_LOOKUP]

      const isPlaceholderValue =
        typeof currentValue === 'string' && placeholderSet?.has(currentValue.toLowerCase().trim())

      if (currentValue === undefined || isPlaceholderValue) {
        enrichedArgs[key] = value
      }
    })

    return enrichedArgs
  }
}
