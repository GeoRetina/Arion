import { BrowserWindow } from 'electron'
import type { Feature, Geometry } from 'geojson'
import { z } from 'zod'
import { tool } from 'ai'
import {
  addMapFeatureToolName,
  addMapFeatureToolDefinition,
  createGeoJSONFeature,
  type AddMapFeatureParams
} from '../llm-tools/visualization-tools/add-vector-feature-tool'
import {
  addGeoreferencedImageLayerToolName,
  addGeoreferencedImageLayerToolDefinition,
  type AddGeoreferencedImageLayerParams,
  type AddGeoreferencedImageLayerPayload
} from '../llm-tools/visualization-tools/add-georeference-image-layer-tool'
import {
  displayChartToolName,
  displayChartToolDefinition,
  type DisplayChartParams
} from '../llm-tools/visualization-tools/display-chart-tool'
import {
  createMapBufferToolName,
  createMapBufferToolDefinition,
  createGeoJSONBuffer,
  type CreateMapBufferParams
} from '../llm-tools/basic-geospatial-tools'
import {
  listMapLayersToolName,
  listMapLayersToolDefinition,
  setLayerStyleToolName,
  setLayerStyleToolDefinition,
  removeMapLayerToolName,
  removeMapLayerToolDefinition,
  type SetLayerStyleParams,
  type RemoveMapLayerParams,
  type AddedLayerInfo
} from '../llm-tools/map-layer-management-tools'
import {
  setMapViewToolName,
  setMapViewToolDefinition,
  type SetMapViewParams
} from '../llm-tools/map-view-control-tools'
import {
  openMapSidebarToolName,
  openMapSidebarToolDefinition
} from '../llm-tools/app-ui-control-tools'
import {
  callAgentToolName,
  callAgentToolDefinition,
  type CallAgentParams
} from '../llm-tools/agent-tools/call-agent-tool'
import type { AddMapFeaturePayload } from '../../shared/ipc-types'
import {
  queryKnowledgeBaseToolName,
  queryKnowledgeBaseToolDefinition,
  type QueryKnowledgeBaseParams
} from '../llm-tools/knowledge-base-tools/query-knowledge-base-tool'
import type { KnowledgeBaseService } from './knowledge-base-service'
import { MAX_RAG_RESULTS } from '../constants/llm-constants'
import type { MCPClientService, DiscoveredMcpTool } from './mcp-client-service'
import { convertImageFileToDataUri } from '../lib/image-processing'
import type { McpPermissionService } from './mcp-permission-service'
import type { AgentRegistryService } from './agent-registry-service'
import type { OrchestrationService } from './orchestration-service'

// Define a type for the tool execution functions
interface ToolExecutorParams {
  args: any // Parsed arguments for the tool
  sourceIdPrefix?: string // Optional prefix for generating unique source IDs for map features
  chatId?: string // Chat ID for permission tracking
}
type ToolExecutor = (params: ToolExecutorParams) => Promise<any> // Returns data to be sent back to LLM

// Updated: Definition structure for Vercel AI SDK tool
interface RegisteredToolDefinition {
  description: string
  inputSchema: z.ZodTypeAny // V5: tool input schema
  // Future: outputSchema?: z.ZodTypeAny
}

interface RegisteredTool {
  name: string
  definition: RegisteredToolDefinition // The schema/definition for the LLM (Vercel AI SDK format)
  execute: ToolExecutor
  category: string // e.g., 'visualization', 'geospatial_basic', 'mcp_dynamic'
}

export class LlmToolService {
  private registeredTools: Map<string, RegisteredTool> = new Map()
  private mainWindow: BrowserWindow | null = null
  private addedLayersInfo: Map<string, AddedLayerInfo> = new Map()
  private knowledgeBaseService: KnowledgeBaseService | null = null
  private mcpClientService: MCPClientService | null = null
  private isInitialized = false // Track initialization
  private currentChatId: string | null = null // Track current chat ID for permission checking
  private mcpPermissionService: McpPermissionService | null = null
  private agentRegistryService: AgentRegistryService | null = null
  private orchestrationService: OrchestrationService | null = null

  constructor(
    knowledgeBaseService?: KnowledgeBaseService,
    mcpClientService?: MCPClientService,
    mcpPermissionService?: McpPermissionService,
    agentRegistryService?: AgentRegistryService,
    orchestrationService?: OrchestrationService
  ) {
    this.knowledgeBaseService = knowledgeBaseService || null
    this.mcpClientService = mcpClientService || null
    this.mcpPermissionService = mcpPermissionService || null
    this.agentRegistryService = agentRegistryService || null
    this.orchestrationService = orchestrationService || null
    // Register built-in tools synchronously in constructor
    this.registerBuiltInTools()
    // Actual assimilation of MCP tools will happen in initialize()
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }
    if (this.mcpClientService) {
      await this.mcpClientService.ensureInitialized() // Wait for MCP clients
      this.assimilateAndRegisterMcpTools() // Now assimilate tools
    } else {
    }
    this.isInitialized = true
  }

  public setMainWindow(window: BrowserWindow) {
    this.mainWindow = window
    if (this.mcpPermissionService) {
      this.mcpPermissionService.setMainWindow(window)
    }
  }

  public setCurrentChatId(chatId: string | null) {
    this.currentChatId = chatId
  }

  public setAgentServices(
    agentRegistryService: AgentRegistryService,
    orchestrationService: OrchestrationService
  ) {
    this.agentRegistryService = agentRegistryService
    this.orchestrationService = orchestrationService
  }

  private async checkMcpToolPermission(toolName: string, serverId: string): Promise<boolean> {
    if (!this.currentChatId) {
      return true
    }

    if (!this.mcpPermissionService) {
      return true
    }

    try {
      const result = await this.mcpPermissionService.requestPermission(
        this.currentChatId,
        toolName,
        serverId
      )

      return result
    } catch (error) {
      return false
    }
  }

  private registerBuiltInTools() {
    // Visualization Tools
    this.registerTool({
      name: addMapFeatureToolName,
      definition: addMapFeatureToolDefinition,
      category: 'visualization',
      execute: async ({ args, sourceIdPrefix = 'llm-tool' }) => {
        const params = args as AddMapFeatureParams
        const feature = createGeoJSONFeature(params)
        const sourceId = `${sourceIdPrefix}-${addMapFeatureToolName}-${Date.now()}`
        this.sendFeatureToMap(feature, {
          sourceId,
          fitBounds: true
        })
        const layerInfo: AddedLayerInfo = {
          sourceId,
          toolName: addMapFeatureToolName,
          addedAt: new Date().toISOString(),
          originalParams: params,
          geometryType: feature.geometry.type
        }
        this.addedLayersInfo.set(sourceId, layerInfo)
        return {
          status: 'success',
          message: `${feature.geometry.type} added to map with source ID: ${sourceId}.`,
          sourceId: sourceId,
          geojson: feature
        }
      }
    })

    // Visualization Tools - Add Georeferenced Image Layer
    this.registerTool({
      name: addGeoreferencedImageLayerToolName,
      definition: addGeoreferencedImageLayerToolDefinition,
      category: 'visualization',
      execute: async ({ args, sourceIdPrefix = 'llm-tool' }) => {
        const params = args as AddGeoreferencedImageLayerParams
        const sourceId =
          params.source_id ||
          `${sourceIdPrefix}-${addGeoreferencedImageLayerToolName}-source-${Date.now()}`
        const layerId =
          params.layer_id ||
          `${sourceIdPrefix}-${addGeoreferencedImageLayerToolName}-layer-${Date.now()}`

        if (!this.mainWindow) {
          return {
            status: 'error',
            message: 'Internal error: Main window not available to add georeferenced image layer.'
          }
        }

        let imageUrlForRenderer: string

        try {
          if (params.image_url.startsWith('http')) {
            imageUrlForRenderer = params.image_url
          } else {
            // For local files, use the new utility function
            imageUrlForRenderer = await convertImageFileToDataUri(params.image_url)
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error during image processing.'
          return {
            status: 'error',
            message: `Failed to process image at ${params.image_url}: ${errorMessage}`
          }
        }

        const ipcPayload: AddGeoreferencedImageLayerPayload = {
          imageUrl: imageUrlForRenderer,
          coordinates: params.coordinates,
          sourceId: sourceId,
          layerId: layerId,
          fitBounds: params.fit_bounds,
          opacity: 1.0 // Always set opacity to 1.0 for the renderer
        }

        this.mainWindow.webContents.send('ctg:map:addGeoreferencedImageLayer', ipcPayload)

        const layerInfo: AddedLayerInfo = {
          sourceId,
          toolName: addGeoreferencedImageLayerToolName,
          addedAt: new Date().toISOString(),
          originalParams: params,
          geometryType: 'raster',
          layerId: layerId
        }
        this.addedLayersInfo.set(sourceId, layerInfo)

        return {
          status: 'success',
          message: `Request to add georeferenced image layer "${layerId}" from URL "${params.image_url}" sent. The image should now be visible on the map with source ID "${sourceId}".`,
          sourceId: sourceId,
          layerId: layerId,
          imageUrl: params.image_url,
          coordinates: params.coordinates
        }
      }
    })

    // NEW Visualization Tool - Display Chart
    this.registerTool({
      name: displayChartToolName,
      definition: displayChartToolDefinition,
      category: 'visualization',
      execute: async ({ args }) => {
        const params = args as DisplayChartParams
        const chartId = `chart-${Date.now()}`

        return {
          status: 'success',
          message: `Chart data prepared for display (ID: ${chartId}). The UI should render this chart inline.`,
          chartId: chartId,
          chartType: params.chartType,
          data: params.data,
          config: params.config
        }
      }
    })

    // Basic Geospatial Tools
    this.registerTool({
      name: createMapBufferToolName,
      definition: createMapBufferToolDefinition,
      category: 'geospatial_basic',
      execute: async ({ args, sourceIdPrefix = 'llm-tool' }) => {
        const params = args as CreateMapBufferParams
        const bufferFeature = createGeoJSONBuffer(params)
        const sourceId = `${sourceIdPrefix}-${createMapBufferToolName}-${Date.now()}`
        this.sendFeatureToMap(bufferFeature, {
          sourceId,
          fitBounds: true
        })
        const layerInfo: AddedLayerInfo = {
          sourceId,
          toolName: createMapBufferToolName,
          addedAt: new Date().toISOString(),
          originalParams: params,
          geometryType: 'Polygon'
        }
        this.addedLayersInfo.set(sourceId, layerInfo)
        return {
          status: 'success',
          message: `Buffer of ${params.radius} ${params.units} created at [${params.longitude}, ${params.latitude}] with source ID: ${sourceId}.`,
          sourceId: sourceId,
          geojson: bufferFeature
        }
      }
    })

    // Map Layer Management Tools
    this.registerTool({
      name: listMapLayersToolName,
      definition: listMapLayersToolDefinition,
      category: 'map_layer_management',
      execute: async () => {
        const layers = Array.from(this.addedLayersInfo.values())
        if (layers.length === 0) {
          return {
            status: 'success',
            message: 'No layers have been programmatically added to the map yet.',
            layers: []
          }
        }
        return {
          status: 'success',
          message: `Found ${layers.length} programmatically added layer(s).`,
          layers: layers.map((l) => ({
            sourceId: l.sourceId,
            toolName: l.toolName,
            addedAt: l.addedAt,
            parameters: l.originalParams,
            geometryType: l.geometryType
          }))
        }
      }
    })

    this.registerTool({
      name: setLayerStyleToolName,
      definition: setLayerStyleToolDefinition,
      category: 'map_layer_management',
      execute: async ({ args }) => {
        const params = args as SetLayerStyleParams

        if (!this.addedLayersInfo.has(params.source_id)) {
          return {
            status: 'error',
            message: `Layer with source ID "${params.source_id}" not found or was not added by a tool.`,
            source_id: params.source_id
          }
        }

        if (!params.paint || Object.keys(params.paint).length === 0) {
          return {
            status: 'success',
            message: 'No paint properties provided. No style changes applied.',
            source_id: params.source_id
          }
        }

        if (!this.mainWindow) {
          return {
            status: 'error',
            message: 'Internal error: Main window not available to send style update.',
            source_id: params.source_id
          }
        }

        this.mainWindow.webContents.send('ctg:map:setPaintProperties', {
          sourceId: params.source_id,
          paintProperties: params.paint
        })

        return {
          status: 'success',
          message: `Styling request for layer ${params.source_id} sent. Check renderer console for map update logs.`,
          source_id: params.source_id,
          applied_properties: params.paint
        }
      }
    })

    this.registerTool({
      name: removeMapLayerToolName,
      definition: removeMapLayerToolDefinition,
      category: 'map_layer_management',
      execute: async ({ args }) => {
        const params = args as RemoveMapLayerParams

        if (!this.addedLayersInfo.has(params.source_id)) {
          return {
            status: 'error',
            message: `Layer with source ID "${params.source_id}" not found or was not added by a tool. Cannot remove.`,
            source_id: params.source_id
          }
        }

        if (!this.mainWindow) {
          return {
            status: 'error',
            message: 'Internal error: Main window not available to send remove layer command.',
            source_id: params.source_id
          }
        }

        // Remove from local tracking first
        this.addedLayersInfo.delete(params.source_id)

        // Send IPC to renderer to remove the source and its associated layers
        this.mainWindow.webContents.send('ctg:map:removeSourceAndLayers', {
          sourceId: params.source_id
        })

        return {
          status: 'success',
          message: `Request to remove layer with source ID "${params.source_id}" sent. It should now be removed from the map and layer list.`,
          removed_source_id: params.source_id
        }
      }
    })

    // Register Set Map View Tool
    this.registerTool({
      name: setMapViewToolName,
      definition: setMapViewToolDefinition,
      category: 'map_view_control',
      execute: async ({ args }) => {
        const params = args as SetMapViewParams

        if (!this.mainWindow) {
          return {
            status: 'error',
            message: 'Internal error: Main window not available to send map view command.',
            params_received: params
          }
        }

        // Construct payload for IPC, only including defined parameters
        const ipcPayload: Partial<SetMapViewParams> = {}
        if (params.center) ipcPayload.center = params.center
        if (params.zoom !== undefined) ipcPayload.zoom = params.zoom
        if (params.pitch !== undefined) ipcPayload.pitch = params.pitch
        if (params.bearing !== undefined) ipcPayload.bearing = params.bearing
        if (params.animate !== undefined) ipcPayload.animate = params.animate

        this.mainWindow.webContents.send('ctg:map:setView', ipcPayload)

        return {
          status: 'success',
          message: `Request to set map view sent with parameters: ${JSON.stringify(ipcPayload)}. Check map for changes.`,
          applied_params: ipcPayload
        }
      }
    })

    // Register App UI Control Tools
    this.registerTool({
      name: openMapSidebarToolName,
      definition: openMapSidebarToolDefinition,
      category: 'app_ui_control',
      execute: async () => {
        if (this.mainWindow) {
          this.mainWindow.webContents.send('ctg:ui:setMapSidebarVisibility', { visible: true })
          return {
            status: 'success',
            message:
              'Request to open map sidebar sent. The user should see the map sidebar if it was closed.'
          }
        } else {
          return {
            status: 'error',
            message: 'Internal error: Main window not available to send UI command.'
          }
        }
      }
    })

    // Register Knowledge Base Tools
    this.registerTool({
      name: queryKnowledgeBaseToolName,
      definition: queryKnowledgeBaseToolDefinition,
      category: 'knowledge_base',
      execute: async ({ args }) => {
        if (!this.knowledgeBaseService) {
          return {
            status: 'error',
            message: 'Knowledge Base Service is not configured. Cannot perform query.'
          }
        }
        try {
          const params = args as QueryKnowledgeBaseParams
          const queryEmbedding = await this.knowledgeBaseService.embedText(params.query)
          const similarChunks = await this.knowledgeBaseService.findSimilarChunks(
            queryEmbedding,
            MAX_RAG_RESULTS
          )

          if (similarChunks && similarChunks.length > 0) {
            const contextHeader = 'Relevant information from your knowledge base:'
            const chunkContents = similarChunks
              .map(
                (chunk, index) => `Chunk ${index + 1} (ID: ${chunk.document_id}/${chunk.id}):
${chunk.content}`
              )
              .join('\n\n')
            const retrieved_context = `${contextHeader}\n${chunkContents}\n\n`
            return {
              status: 'success',
              message: `Found ${similarChunks.length} relevant context snippets from the knowledge base.`,
              retrieved_context: retrieved_context
            }
          } else {
            return {
              status: 'no_results',
              message: 'No relevant information found in the knowledge base for your query.'
            }
          }
        } catch (error) {
          return {
            status: 'error',
            message: `Error querying knowledge base: ${error instanceof Error ? error.message : 'Unknown error'}.`
          }
        }
      }
    })

    // Register Send To Agent Tool (for orchestrators only)
    this.registerTool({
      name: callAgentToolName,
      definition: callAgentToolDefinition,
      category: 'agent_communication',
      execute: async ({ args, chatId }) => {
        if (!this.agentRegistryService || !this.orchestrationService) {
          return {
            status: 'error',
            message: 'Agent services are not properly configured. Cannot delegate to other agents.'
          }
        }

        try {
          const params = args as CallAgentParams

          // Use the actual chat ID from the context if available
          const actualChatId = chatId || this.currentChatId || 'unknown'

          // Enhance params with agent name for better UI display during loading
          let enhancedParams = params
          if (this.agentRegistryService && params.agent_id) {
            try {
              const agent = await this.agentRegistryService.getAgentById(params.agent_id)
              if (agent) {
                enhancedParams = {
                  ...params,
                  agent_name: agent.name
                }
              }
            } catch (error) {}
          }

          // Import the function here to avoid circular dependencies
          const { callAgent } = await import('../llm-tools/agent-tools/call-agent-tool')

          // Execute the callAgent function with the correct parameters
          return await callAgent(
            enhancedParams,
            actualChatId,
            this.agentRegistryService,
            this.orchestrationService
          )
        } catch (error) {
          return {
            status: 'error',
            message: `Error delegating to agent: ${error instanceof Error ? error.message : 'Unknown error'}.`
          }
        }
      }
    })
  }

  private registerTool(toolToRegister: RegisteredTool) {
    if (this.registeredTools.has(toolToRegister.name)) {
    }
    if (
      !toolToRegister.definition ||
      typeof toolToRegister.definition.description !== 'string' ||
      !(toolToRegister.definition.inputSchema instanceof z.ZodType)
    ) {
      return
    }
    this.registeredTools.set(toolToRegister.name, toolToRegister)
  }

  private assimilateAndRegisterMcpTools() {
    if (!this.mcpClientService) {
      return
    }

    const mcpTools: DiscoveredMcpTool[] = this.mcpClientService.getDiscoveredTools()

    mcpTools.forEach((mcpTool) => {
      if (this.registeredTools.has(mcpTool.name)) {
        return
      }

      const toolDefinitionForLLM: RegisteredToolDefinition = {
        description:
          mcpTool.description ||
          `Dynamically added MCP tool: ${mcpTool.name} from server ${mcpTool.serverId}`,
        inputSchema: z.object({}).passthrough()
      }

      this.registerTool({
        name: mcpTool.name,
        definition: toolDefinitionForLLM,
        category: `mcp_server_${mcpTool.serverId}`,
        execute: async ({ args }) => {
          // Check permission for MCP tools
          const hasPermission = await this.checkMcpToolPermission(mcpTool.name, mcpTool.serverId)
          if (!hasPermission) {
            throw new Error(
              `Permission denied for MCP tool "${mcpTool.name}". User must grant permission to use this tool.`
            )
          }

          if (!this.mcpClientService) {
            throw new Error(`MCPClientService not available for executing tool "${mcpTool.name}".`)
          }
          return this.mcpClientService.callTool(mcpTool.serverId, mcpTool.name, args)
        }
      })
    })
  }

  /**
   * Get tool definitions for LLM, optionally filtered to only include specific tools
   * @param allowedToolIds Optional array of tool IDs to include (if not provided, all tools are included)
   * @returns Object containing tool definitions for use with the LLM
   */
  public getToolDefinitionsForLLM(allowedToolIds?: string[]): Record<string, any> {
    const llmTools: Record<string, any> = {}

    this.registeredTools.forEach((registeredToolEntry) => {
      // If allowedToolIds is provided, only include tools in that list
      if (!allowedToolIds || allowedToolIds.includes(registeredToolEntry.name)) {
        llmTools[registeredToolEntry.name] = tool({
          description: registeredToolEntry.definition.description,
          inputSchema: registeredToolEntry.definition.inputSchema,
          execute: async (args: any) => {
            return this.executeTool(registeredToolEntry.name, args)
          }
        })
      }
    })

    // Log the filtering results if allowedToolIds was provided
    if (allowedToolIds) {
      const includedTools = Object.keys(llmTools)
    }

    return llmTools
  }

  public async executeTool(toolName: string, args: any): Promise<any> {
    const toolEntry = this.registeredTools.get(toolName)
    if (!toolEntry) {
      throw new Error(`Tool "${toolName}" not found.`)
    }

    try {
      const result = await toolEntry.execute({ args, chatId: this.currentChatId || undefined })
      return result
    } catch (error) {
      return {
        status: 'error',
        tool_name: toolName,
        error_message:
          error instanceof Error
            ? error.message
            : 'An unknown error occurred during tool execution.'
      }
    }
  }

  /**
   * Get discovered MCP tools for system prompt generation
   * @returns Array of discovered MCP tools
   */
  public getMcpTools() {
    if (!this.mcpClientService) {
      return []
    }
    return this.mcpClientService.getDiscoveredTools() || []
  }

  private sendFeatureToMap(feature: Feature<Geometry>, options?: Partial<AddMapFeaturePayload>) {
    if (!this.mainWindow) {
      return
    }
    const payload: AddMapFeaturePayload = {
      feature,
      fitBounds: options?.fitBounds ?? true,
      sourceId: options?.sourceId
    }
    this.mainWindow.webContents.send('ctg:map:addFeature', payload)
  }
}
