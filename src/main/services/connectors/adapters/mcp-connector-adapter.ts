import type { ConnectorCapability, IntegrationId } from '../../../../shared/ipc-types'
import type { MCPClientService } from '../../mcp-client-service'
import type {
  ConnectorAdapter,
  ConnectorAdapterResult,
  ConnectorExecutionContext,
  ConnectorExecutionRequest
} from './connector-adapter'
import { buildConnectorError } from './connector-adapter'

export interface McpConnectorCapabilityMapping {
  integrationId: IntegrationId
  capability: ConnectorCapability
  toolName: string
  serverId?: string
}

export const DEFAULT_MCP_CONNECTOR_TOOL_MAPPINGS: McpConnectorCapabilityMapping[] = [
  {
    integrationId: 'stac',
    capability: 'catalog.search',
    toolName: 'stac_search_catalog'
  },
  {
    integrationId: 'wms',
    capability: 'tiles.getCapabilities',
    toolName: 'wms_get_capabilities'
  },
  {
    integrationId: 'cog',
    capability: 'raster.inspectMetadata',
    toolName: 'cog_inspect_metadata'
  },
  {
    integrationId: 'wmts',
    capability: 'tiles.getCapabilities',
    toolName: 'wmts_get_capabilities'
  },
  {
    integrationId: 'pmtiles',
    capability: 'tiles.inspectArchive',
    toolName: 'pmtiles_inspect_archive'
  },
  {
    integrationId: 's3',
    capability: 'storage.list',
    toolName: 's3_list_objects'
  },
  {
    integrationId: 'google-earth-engine',
    capability: 'gee.listAlgorithms',
    toolName: 'gee_list_algorithms'
  },
  {
    integrationId: 'postgresql-postgis',
    capability: 'sql.query',
    toolName: 'postgresql_run_query_safe'
  }
]

const mappingKey = (integrationId: IntegrationId, capability: ConnectorCapability): string =>
  `${integrationId}:${capability}`

export class McpConnectorAdapter implements ConnectorAdapter {
  public readonly id = 'mcp-connector-adapter'
  public readonly backend = 'mcp' as const
  private readonly mappingByKey: Map<string, McpConnectorCapabilityMapping> = new Map()

  constructor(
    private readonly mcpClientService: MCPClientService,
    mappings: McpConnectorCapabilityMapping[] = DEFAULT_MCP_CONNECTOR_TOOL_MAPPINGS
  ) {
    for (const mapping of mappings) {
      this.mappingByKey.set(mappingKey(mapping.integrationId, mapping.capability), mapping)
    }
  }

  public supports(integrationId: IntegrationId, capability: ConnectorCapability): boolean {
    return this.mappingByKey.has(mappingKey(integrationId, capability))
  }

  public async execute(
    request: ConnectorExecutionRequest,
    context: ConnectorExecutionContext
  ): Promise<ConnectorAdapterResult> {
    void context

    const mapping = this.mappingByKey.get(mappingKey(request.integrationId, request.capability))
    if (!mapping) {
      return buildConnectorError(
        'UNSUPPORTED_CAPABILITY',
        `No MCP mapping configured for ${request.integrationId}/${request.capability}`
      )
    }

    const discoveredTools = this.mcpClientService.getDiscoveredTools()
    const matchingDiscoveredTools = discoveredTools.filter(
      (tool) =>
        tool.name === mapping.toolName && (!mapping.serverId || tool.serverId === mapping.serverId)
    )

    if (matchingDiscoveredTools.length === 0) {
      return buildConnectorError(
        mapping.serverId ? 'MCP_SERVER_UNAVAILABLE' : 'MCP_TOOL_UNAVAILABLE',
        mapping.serverId
          ? `MCP tool "${mapping.toolName}" is not available on server "${mapping.serverId}".`
          : `MCP tool "${mapping.toolName}" is not currently available.`
      )
    }

    if (!mapping.serverId && matchingDiscoveredTools.length > 1) {
      return buildConnectorError(
        'MCP_TOOL_UNAVAILABLE',
        `Multiple MCP servers expose "${mapping.toolName}". Configure an explicit server mapping to avoid ambiguous execution.`,
        {
          toolName: mapping.toolName,
          candidateServerIds: matchingDiscoveredTools.map((tool) => tool.serverId)
        }
      )
    }

    const selectedTool = matchingDiscoveredTools[0]

    try {
      const result = await this.mcpClientService.callTool(
        selectedTool.serverId,
        mapping.toolName,
        request.input
      )
      return {
        success: true,
        data: result,
        details: {
          mcpServerId: selectedTool.serverId,
          mcpToolName: mapping.toolName
        }
      }
    } catch (error) {
      return buildConnectorError(
        'EXECUTION_FAILED',
        `MCP execution failed for "${mapping.toolName}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          mcpServerId: selectedTool.serverId,
          mcpToolName: mapping.toolName
        },
        true
      )
    }
  }
}
