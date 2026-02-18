import type { ConnectorCapability, IntegrationId } from '../../../../shared/ipc-types'
import {
  cogInspectMetadataToolDefinition,
  cogInspectMetadataToolName,
  geeListAlgorithmsToolDefinition,
  geeListAlgorithmsToolName,
  pmtilesInspectArchiveToolDefinition,
  pmtilesInspectArchiveToolName,
  postgresqlRunQuerySafeToolDefinition,
  postgresqlRunQuerySafeToolName,
  s3ListObjectsToolDefinition,
  s3ListObjectsToolName,
  stacSearchCatalogToolDefinition,
  stacSearchCatalogToolName,
  wmsGetCapabilitiesToolDefinition,
  wmsGetCapabilitiesToolName,
  wmtsGetCapabilitiesToolDefinition,
  wmtsGetCapabilitiesToolName
} from '../../../llm-tools/integration-tools'
import type { ConnectorExecutionService } from '../../connectors/connector-execution-service'
import type { ToolRegistry } from '../tool-registry'
import type { RegisteredToolDefinition } from '../tool-types'

export interface IntegrationToolDependencies {
  getConnectorExecutionService: () => ConnectorExecutionService | null
}

interface IntegrationToolRegistration {
  name: string
  definition: RegisteredToolDefinition
  integrationId: IntegrationId
  capability: ConnectorCapability
}

const INTEGRATION_TOOL_REGISTRATIONS: IntegrationToolRegistration[] = [
  {
    name: stacSearchCatalogToolName,
    definition: stacSearchCatalogToolDefinition,
    integrationId: 'stac',
    capability: 'catalog.search'
  },
  {
    name: cogInspectMetadataToolName,
    definition: cogInspectMetadataToolDefinition,
    integrationId: 'cog',
    capability: 'raster.inspectMetadata'
  },
  {
    name: wmsGetCapabilitiesToolName,
    definition: wmsGetCapabilitiesToolDefinition,
    integrationId: 'wms',
    capability: 'tiles.getCapabilities'
  },
  {
    name: pmtilesInspectArchiveToolName,
    definition: pmtilesInspectArchiveToolDefinition,
    integrationId: 'pmtiles',
    capability: 'tiles.inspectArchive'
  },
  {
    name: wmtsGetCapabilitiesToolName,
    definition: wmtsGetCapabilitiesToolDefinition,
    integrationId: 'wmts',
    capability: 'tiles.getCapabilities'
  },
  {
    name: s3ListObjectsToolName,
    definition: s3ListObjectsToolDefinition,
    integrationId: 's3',
    capability: 'storage.list'
  },
  {
    name: geeListAlgorithmsToolName,
    definition: geeListAlgorithmsToolDefinition,
    integrationId: 'google-earth-engine',
    capability: 'gee.listAlgorithms'
  },
  {
    name: postgresqlRunQuerySafeToolName,
    definition: postgresqlRunQuerySafeToolDefinition,
    integrationId: 'postgresql-postgis',
    capability: 'sql.query'
  }
]

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

const createExecutor =
  (
    deps: IntegrationToolDependencies,
    integrationId: IntegrationId,
    capability: ConnectorCapability
  ) =>
  async ({ args, chatId }: { args: unknown; chatId?: string }): Promise<unknown> => {
    const connectorExecutionService = deps.getConnectorExecutionService()
    if (!connectorExecutionService) {
      return {
        status: 'error',
        error_code: 'EXECUTION_FAILED',
        message: 'Connector execution service is not configured.'
      }
    }

    const normalizedArgs = toRecord(args)
    const result = await connectorExecutionService.execute({
      integrationId,
      capability,
      chatId,
      input: normalizedArgs,
      timeoutMs: typeof normalizedArgs.timeoutMs === 'number' ? normalizedArgs.timeoutMs : undefined
    })

    if (result.success) {
      return {
        status: 'success',
        run_id: result.runId,
        backend: result.backend,
        duration_ms: result.durationMs,
        data: result.data,
        details: result.details
      }
    }

    return {
      status: 'error',
      run_id: result.runId,
      backend: result.backend,
      duration_ms: result.durationMs,
      error_code: result.error.code,
      message: result.error.message,
      attempts: result.attempts
    }
  }

export function registerIntegrationTools(
  registry: ToolRegistry,
  deps: IntegrationToolDependencies
): void {
  for (const tool of INTEGRATION_TOOL_REGISTRATIONS) {
    registry.register({
      name: tool.name,
      definition: tool.definition,
      category: 'integrations',
      execute: createExecutor(deps, tool.integrationId, tool.capability)
    })
  }
}
