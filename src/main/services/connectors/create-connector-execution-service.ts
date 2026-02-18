import type { SettingsService } from '../settings-service'
import type { ConnectorHubService } from '../connector-hub-service'
import type { PostgreSQLService } from '../postgresql-service'
import type { MCPClientService } from '../mcp-client-service'
import type { ConnectorCapability, IntegrationId } from '../../../shared/ipc-types'
import { McpConnectorAdapter } from './adapters/mcp-connector-adapter'
import { NativeConnectorAdapter } from './adapters/native-connector-adapter'
import { ConnectorCapabilityRegistry } from './connector-capability-registry'
import { ConnectorExecutionService } from './connector-execution-service'
import { ConnectorPolicyService } from './policy/connector-policy-service'
import { ConnectorRunLogger } from './telemetry/connector-run-logger'

interface ConnectorExecutionRuntimeDeps {
  settingsService: SettingsService
  connectorHubService: ConnectorHubService
  postgresqlService: PostgreSQLService
  mcpClientService: MCPClientService
}

export interface ConnectorExecutionRuntime {
  executionService: ConnectorExecutionService
  policyService: ConnectorPolicyService
  runLogger: ConnectorRunLogger
}

interface ConnectorRouteTemplate {
  integrationId: IntegrationId
  capability: ConnectorCapability
  nativeDescription: string
  mcpDescription: string
  sensitivity?: 'normal' | 'sensitive'
}

const ROUTE_TEMPLATES: ConnectorRouteTemplate[] = [
  {
    integrationId: 'stac',
    capability: 'catalog.search',
    nativeDescription: 'Search STAC catalogs',
    mcpDescription: 'Search STAC catalogs via MCP fallback'
  },
  {
    integrationId: 'cog',
    capability: 'raster.inspectMetadata',
    nativeDescription: 'Inspect COG/TIFF archive metadata and structure hints',
    mcpDescription: 'Inspect COG metadata via MCP fallback'
  },
  {
    integrationId: 'wms',
    capability: 'tiles.getCapabilities',
    nativeDescription: 'Resolve WMS GetCapabilities',
    mcpDescription: 'Resolve WMS capabilities via MCP fallback'
  },
  {
    integrationId: 'pmtiles',
    capability: 'tiles.inspectArchive',
    nativeDescription: 'Inspect PMTiles archive header metadata',
    mcpDescription: 'Inspect PMTiles archive via MCP fallback'
  },
  {
    integrationId: 'wmts',
    capability: 'tiles.getCapabilities',
    nativeDescription: 'Resolve WMTS GetCapabilities',
    mcpDescription: 'Resolve WMTS capabilities via MCP fallback'
  },
  {
    integrationId: 's3',
    capability: 'storage.list',
    nativeDescription: 'List objects from configured S3 bucket',
    mcpDescription: 'List objects via MCP fallback',
    sensitivity: 'sensitive'
  },
  {
    integrationId: 'postgresql-postgis',
    capability: 'sql.query',
    nativeDescription: 'Execute safe SQL query against PostgreSQL/PostGIS',
    mcpDescription: 'Execute SQL query via MCP fallback',
    sensitivity: 'sensitive'
  },
  {
    integrationId: 'google-earth-engine',
    capability: 'gee.listAlgorithms',
    nativeDescription: 'List Earth Engine algorithms',
    mcpDescription: 'List Earth Engine algorithms via MCP fallback',
    sensitivity: 'sensitive'
  }
]

export const createConnectorExecutionRuntime = (
  deps: ConnectorExecutionRuntimeDeps
): ConnectorExecutionRuntime => {
  const registry = new ConnectorCapabilityRegistry()
  const runLogger = new ConnectorRunLogger()
  const policyService = new ConnectorPolicyService(deps.settingsService)

  const nativeAdapter = new NativeConnectorAdapter(deps.connectorHubService, deps.postgresqlService)
  const mcpAdapter = new McpConnectorAdapter(deps.mcpClientService)

  for (const route of ROUTE_TEMPLATES) {
    registry.register({
      integrationId: route.integrationId,
      capability: route.capability,
      adapter: nativeAdapter,
      description: route.nativeDescription,
      sensitivity: route.sensitivity,
      priority: 10
    })

    registry.register({
      integrationId: route.integrationId,
      capability: route.capability,
      adapter: mcpAdapter,
      description: route.mcpDescription,
      sensitivity: route.sensitivity,
      priority: 80
    })
  }

  const executionService = new ConnectorExecutionService(registry, policyService, runLogger)

  return {
    executionService,
    policyService,
    runLogger
  }
}
