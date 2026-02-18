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
import type { PluginLoaderService } from './plugin/plugin-loader-service'
import type { PluginHookEvent } from './plugin/plugin-types'
import { validateAgainstJsonSchema } from './plugin/json-schema-validator'

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
  private pluginLoaderService: PluginLoaderService | null = null

  constructor(
    knowledgeBaseService?: KnowledgeBaseService,
    mcpClientService?: MCPClientService,
    mcpPermissionService?: McpPermissionService,
    agentRegistryService?: AgentRegistryService,
    orchestrationService?: OrchestrationService,
    postgresqlService?: PostgreSQLService,
    pluginLoaderService?: PluginLoaderService
  ) {
    this.knowledgeBaseService = knowledgeBaseService || null
    this.mcpClientService = mcpClientService || null
    this.mcpPermissionService = mcpPermissionService || null
    this.agentRegistryService = agentRegistryService || null
    this.orchestrationService = orchestrationService || null
    this.postgresqlService = postgresqlService || null
    this.pluginLoaderService = pluginLoaderService || null
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
    if (this.pluginLoaderService) {
      await this.pluginLoaderService.reload()
      this.refreshPluginToolsFromLoader()
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
          const normalizedArgs =
            injectedArgs && typeof injectedArgs === 'object'
              ? (injectedArgs as { [key: string]: unknown })
              : undefined

          return this.mcpClientService.callTool(mcpTool.serverId, mcpTool.name, normalizedArgs)
        }
      })
    })
  }

  public refreshPluginToolsFromLoader(): void {
    this.toolRegistry.removeWhere((tool) => typeof tool.pluginId === 'string')
    if (!this.pluginLoaderService) {
      return
    }

    const resolvedTools = this.pluginLoaderService.getResolvedTools()
    for (const pluginTool of resolvedTools) {
      if (this.toolRegistry.has(pluginTool.name)) {
        this.pluginLoaderService.appendDiagnostics([
          {
            level: 'warning',
            code: 'plugin_tool_name_conflict',
            message: `Tool "${pluginTool.name}" conflicts with an existing tool and was skipped.`,
            pluginId: pluginTool.pluginId,
            timestamp: new Date().toISOString()
          }
        ])
        continue
      }

      const toolDefinitionForLLM: RegisteredToolDefinition = {
        description: pluginTool.description,
        inputSchema: z.object({}).passthrough()
      }

      this.toolRegistry.register({
        name: pluginTool.name,
        definition: toolDefinitionForLLM,
        category: pluginTool.category,
        isDynamic: true,
        pluginId: pluginTool.pluginId,
        execute: async ({ args, chatId }) => {
          if (pluginTool.inputSchema) {
            const schemaErrors = validateAgainstJsonSchema(args, pluginTool.inputSchema)
            if (schemaErrors.length > 0) {
              throw new Error(
                `Plugin tool input validation failed for "${pluginTool.name}": ${schemaErrors.join('; ')}`
              )
            }
          }

          return pluginTool.execute({
            args,
            chatId
          })
        }
      })
    }
  }

  public getToolDefinitionsForLLM(allowedToolIds?: string[]): Record<string, unknown> {
    return this.toolRegistry.createToolDefinitions(
      (toolName, args) => this.executeTool(toolName, args),
      allowedToolIds
    )
  }

  public async executeTool(toolName: string, args: unknown): Promise<unknown> {
    const toolEntry = this.toolRegistry.get(toolName)
    if (!toolEntry) {
      throw new Error(`Tool "${toolName}" not found.`)
    }

    const chatId = this.currentChatId || undefined
    const beforePayload = await this.emitHook('before_tool_call', {
      toolName,
      args,
      chatId
    })
    const normalizedArgs = this.extractFromHookPayload(beforePayload, 'args', args)

    try {
      let result = await toolEntry.execute({ args: normalizedArgs, chatId })
      const afterPayload = await this.emitHook('after_tool_call', {
        toolName,
        args: normalizedArgs,
        result,
        chatId
      })
      result = this.extractFromHookPayload(afterPayload, 'result', result)
      await this.emitHook('tool_result_persist', {
        toolName,
        args: normalizedArgs,
        result,
        chatId
      })
      return result
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'An unknown error occurred during tool execution.'
      await this.emitHook('after_tool_call', {
        toolName,
        args: normalizedArgs,
        error: errorMessage,
        chatId
      })
      await this.emitHook('tool_result_persist', {
        toolName,
        args: normalizedArgs,
        error: errorMessage,
        chatId
      })
      return {
        status: 'error',
        tool_name: toolName,
        error_message: errorMessage
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

  public async emitLifecycleHook(
    event: PluginHookEvent,
    payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this.emitHook(event, payload)
  }

  private async emitHook<T extends Record<string, unknown>>(
    event: PluginHookEvent,
    payload: T
  ): Promise<T> {
    if (!this.pluginLoaderService) {
      return payload
    }

    const hookResult = await this.pluginLoaderService.getHookRunner().emit(event, payload, {
      chatId: this.currentChatId || undefined,
      source: 'llm-tool-service'
    })
    this.pluginLoaderService.appendDiagnostics(hookResult.diagnostics)
    return hookResult.payload
  }

  private extractFromHookPayload<T>(payload: unknown, key: string, fallback: T): T {
    if (!payload || typeof payload !== 'object') {
      return fallback
    }
    const candidate = (payload as Record<string, unknown>)[key]
    return (candidate as T) ?? fallback
  }
}
