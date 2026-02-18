import type {
  IntegrationConfig,
  IntegrationHealthCheckResult,
  IntegrationId,
  PostgreSQLConfig
} from '../../../../shared/ipc-types'
import type { PostgreSQLService } from '../../postgresql-service'
import type {
  CogIntegrationConfig,
  GoogleEarthEngineIntegrationConfig,
  PmtilesIntegrationConfig,
  S3IntegrationConfig,
  StacIntegrationConfig,
  WmsIntegrationConfig,
  WmtsIntegrationConfig
} from '../schemas'
import { checkPostgreSQL } from './postgresql-checker'
import {
  checkCog,
  checkGoogleEarthEngine,
  checkPmtiles,
  checkStac,
  checkWms,
  checkWmts
} from './http-checkers'
import { checkS3 } from './s3-checker'
import { type ConnectionMode, createHealthCheckResult } from './result'

export const runIntegrationHealthCheck = async (
  id: IntegrationId,
  config: IntegrationConfig,
  mode: ConnectionMode,
  postgresqlService: PostgreSQLService
): Promise<IntegrationHealthCheckResult> => {
  try {
    switch (id) {
      case 'postgresql-postgis':
        return await checkPostgreSQL(config as PostgreSQLConfig, mode, postgresqlService)
      case 'stac':
        return await checkStac(config as StacIntegrationConfig)
      case 'cog':
        return await checkCog(config as CogIntegrationConfig)
      case 'pmtiles':
        return await checkPmtiles(config as PmtilesIntegrationConfig)
      case 'wms':
        return await checkWms(config as WmsIntegrationConfig)
      case 'wmts':
        return await checkWmts(config as WmtsIntegrationConfig)
      case 's3':
        return await checkS3(config as S3IntegrationConfig)
      case 'google-earth-engine':
        return await checkGoogleEarthEngine(config as GoogleEarthEngineIntegrationConfig)
    }
  } catch (error) {
    return createHealthCheckResult(
      false,
      'error',
      error instanceof Error ? error.message : 'Unknown integration error'
    )
  }
}
