import type {
  IntegrationHealthCheckResult,
  PostgreSQLConfig,
  PostgreSQLConnectionResult
} from '../../../../shared/ipc-types'
import type { PostgreSQLService } from '../../postgresql-service'
import { type ConnectionMode, createHealthCheckResult } from './result'

const mapPostgreSQLResult = (result: PostgreSQLConnectionResult): IntegrationHealthCheckResult => {
  if (result.success) {
    return createHealthCheckResult(true, 'connected', result.message, {
      version: result.version || 'unknown',
      postgisVersion: result.postgisVersion || null
    })
  }
  return createHealthCheckResult(false, 'error', result.message)
}

export const checkPostgreSQL = async (
  config: PostgreSQLConfig,
  mode: ConnectionMode,
  postgresqlService: PostgreSQLService
): Promise<IntegrationHealthCheckResult> => {
  const result =
    mode === 'connect'
      ? await postgresqlService.createConnection('postgresql-postgis', config)
      : await postgresqlService.testConnection(config)
  return mapPostgreSQLResult(result)
}
