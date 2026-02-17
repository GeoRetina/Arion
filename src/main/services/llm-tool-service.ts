import { BrowserWindow } from 'electron'
import { z } from 'zod'
import type { KnowledgeBaseService } from './knowledge-base-service'
import type { MCPClientService, DiscoveredMcpTool } from './mcp-client-service'
import type { McpPermissionService } from './mcp-permission-service'
import type { AgentRegistryService } from './agent-registry-service'
import type { OrchestrationService } from './orchestration-service'
import type { PostgreSQLService } from './postgresql-service'
import { ToolRegistry } from './tooling/tool-registry'
import { MapLayerTracker } from './tooling/map-layer-tracker'
import { registerBuiltInTools } from './tooling/register-built-in-tools'
import { ConnectionCredentialInjector } from './tooling/connection-credential-injector'
import type { RegisteredToolDefinition } from './tooling/tool-types'
import { CONNECTION_SECURITY_NOTE } from './tooling/database-placeholders'

export class LlmToolService {
  private readonly toolRegistry = new ToolRegistry()
  private readonly mapLayerTracker = new MapLayerTracker()
  private readonly credentialInjector = new ConnectionCredentialInjector()
  private mainWindow: BrowserWindow | null = null
  private knowledgeBaseService: KnowledgeBaseService | null = null
  private mcpClientService: MCPClientService | null = null
  private isInitialized = false
  private currentChatId: string | null = null
  private mcpPermissionService: McpPermissionService | null = null
  private agentRegistryService: AgentRegistryService | null = null
  private orchestrationService: OrchestrationService | null = null
  private postgresqlService: PostgreSQLService | null = null

  constructor(
    knowledgeBaseService?: KnowledgeBaseService,
    mcpClientService?: MCPClientService,
    mcpPermissionService?: McpPermissionService,
    agentRegistryService?: AgentRegistryService,
    orchestrationService?: OrchestrationService,
    postgresqlService?: PostgreSQLService
  ) {
    this.knowledgeBaseService = knowledgeBaseService || null
    this.mcpClientService = mcpClientService || null
    this.mcpPermissionService = mcpPermissionService || null
    this.agentRegistryService = agentRegistryService || null
    this.orchestrationService = orchestrationService || null
    this.postgresqlService = postgresqlService || null
    this.credentialInjector.setPostgresqlService(this.postgresqlService)

    registerBuiltInTools({
      registry: this.toolRegistry,
      mapLayerTracker: this.mapLayerTracker,
      getMainWindow: () => this.mainWindow,
      getKnowledgeBaseService: () => this.knowledgeBaseService,
      getPostgresqlService: () => this.postgresqlService,
      getAgentRegistryService: () => this.agentRegistryService,
      getOrchestrationService: () => this.orchestrationService
    })
    // Actual assimilation of MCP tools will happen in initialize()
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }
    if (this.mcpClientService) {
      await this.mcpClientService.ensureInitialized()
      this.assimilateAndRegisterMcpTools()
    }
    this.isInitialized = true
  }

  public setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
    this.mapLayerTracker.setMainWindow(window)
    if (this.mcpPermissionService) {
      this.mcpPermissionService.setMainWindow(window)
    }
  }

  public setCurrentChatId(chatId: string | null): void {
    this.currentChatId = chatId
  }

  public setAgentServices(
    agentRegistryService: AgentRegistryService,
    orchestrationService: OrchestrationService
  ): void {
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
    } catch {
      return false
    }
  }

  private assimilateAndRegisterMcpTools(): void {
    if (!this.mcpClientService) {
      return
    }

    const mcpTools: DiscoveredMcpTool[] = this.mcpClientService.getDiscoveredTools()

    mcpTools.forEach((mcpTool) => {
      if (this.toolRegistry.has(mcpTool.name)) {
        return
      }

      let description =
        mcpTool.description ||
        `Dynamically added MCP tool: ${mcpTool.name} from server ${mcpTool.serverId}`
      description = `${description}\n\n${CONNECTION_SECURITY_NOTE}`

      const toolDefinitionForLLM: RegisteredToolDefinition = {
        description,
        inputSchema: z.object({}).passthrough()
      }

      this.toolRegistry.register({
        name: mcpTool.name,
        definition: toolDefinitionForLLM,
        category: `mcp_server_${mcpTool.serverId}`,
        isDynamic: true,
        execute: async ({ args }) => {
          const hasPermission = await this.checkMcpToolPermission(mcpTool.name, mcpTool.serverId)
          if (!hasPermission) {
            throw new Error(
              `Permission denied for MCP tool "${mcpTool.name}". User must grant permission to use this tool.`
            )
          }

          if (!this.mcpClientService) {
            throw new Error(`MCPClientService not available for executing tool "${mcpTool.name}".`)
          }

          const injectedArgs = await this.credentialInjector.inject(args)

          return this.mcpClientService.callTool(mcpTool.serverId, mcpTool.name, injectedArgs)
        }
      })
    })
  }

  public getToolDefinitionsForLLM(allowedToolIds?: string[]): Record<string, UnsafeAny> {
    return this.toolRegistry.createToolDefinitions(
      (toolName, args) => this.executeTool(toolName, args),
      allowedToolIds
    )
  }

  public async executeTool(toolName: string, args: UnsafeAny): Promise<UnsafeAny> {
    const toolEntry = this.toolRegistry.get(toolName)
    if (!toolEntry) {
      throw new Error(`Tool "${toolName}" not found.`)
    }

    try {
      return await toolEntry.execute({ args, chatId: this.currentChatId || undefined })
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

  public getMcpTools(): DiscoveredMcpTool[] {
    if (!this.mcpClientService) {
      return []
    }
    return this.mcpClientService.getDiscoveredTools() || []
  }

  public getAllAvailableTools(): string[] {
    return this.toolRegistry.getAllToolNames().sort()
  }
}
