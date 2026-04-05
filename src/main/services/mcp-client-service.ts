import { EventEmitter } from 'events'
import type { Stream } from 'node:stream'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { Implementation, ListToolsResult, Tool } from '@modelcontextprotocol/sdk/types.js'
import type {
  McpServerConfig,
  McpServerRuntimeStatus,
  McpServerTestResult
} from '../../shared/ipc-types'
import { ensureLocalCommandOrExecutable } from '../security/path-security'
import { SettingsService } from './settings-service'
import { appendMcpRuntimeDetail, summarizeMcpRuntimeFailure } from './mcp-runtime-error-utils'

export interface DiscoveredMcpTool extends Tool {
  serverId: string
}

interface TransportDiagnosticsHandle {
  dispose: () => void
  getDetail: () => string | undefined
}

export class MCPClientService extends EventEmitter {
  private settingsService: SettingsService
  private clients: Map<string, Client> = new Map()
  private discoveredTools: DiscoveredMcpTool[] = []
  private runtimeStatuses: Map<string, McpServerRuntimeStatus> = new Map()
  private serverConfigs: Map<string, McpServerConfig> = new Map()
  private initializationPromise: Promise<void> | null = null
  private isShuttingDown = false

  constructor(settingsService: SettingsService) {
    super()
    this.settingsService = settingsService
    this.initializationPromise = this.loadMcpServersAndDiscoverTools()
  }

  public async ensureInitialized(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.loadMcpServersAndDiscoverTools()
    }

    return this.initializationPromise
  }

  public async reloadServerConfigurations(): Promise<void> {
    const serverConfigs = await this.settingsService.getMcpServerConfigurations()
    await this.syncServerConfigurations(serverConfigs)
  }

  public async upsertServerConfiguration(config: McpServerConfig): Promise<void> {
    const previousConfig = this.serverConfigs.get(config.id)
    this.serverConfigs.set(config.id, config)

    if (!config.enabled) {
      await this.disconnectServer(config.id)
      this.setRuntimeStatus(
        this.buildRuntimeStatus(config, 'disabled', {
          toolCount: 0
        })
      )
      return
    }

    if (!this.shouldReconnectServer(previousConfig, config)) {
      return
    }

    await this.connectToServerAndDiscover(config, true)
  }

  public async removeServerConfiguration(serverId: string): Promise<void> {
    this.serverConfigs.delete(serverId)
    this.runtimeStatuses.delete(serverId)
    await this.disconnectServer(serverId)
  }

  public getRuntimeStatuses(): McpServerRuntimeStatus[] {
    return Array.from(this.runtimeStatuses.values())
  }

  public async testServerConnection(
    config: Omit<McpServerConfig, 'id'>
  ): Promise<McpServerTestResult> {
    let client: Client | null = null
    let diagnosticsHandle: TransportDiagnosticsHandle | null = null

    try {
      const transport = this.createTransport(config)
      if (!transport) {
        return {
          success: false,
          error: 'Provide a command for stdio or a valid URL for HTTP-based MCP servers.'
        }
      }

      diagnosticsHandle = this.attachTransportDiagnostics(transport)
      client = new Client({ name: 'ArionMCPClient', version: '0.1.0' })
      await client.connect(transport)

      const serverVersion = this.safeGetServerVersion(client)
      const listToolsResponse = (await client.listTools()) as ListToolsResult
      const tools = Array.isArray(listToolsResponse?.tools)
        ? listToolsResponse.tools.map((tool) => ({
            name: tool.name,
            description: tool.description
          }))
        : []

      return {
        success: true,
        serverName: serverVersion?.name,
        serverVersion: serverVersion?.version,
        tools
      }
    } catch (error) {
      const failure = summarizeMcpRuntimeFailure(error, diagnosticsHandle?.getDetail())
      return {
        success: false,
        error: failure.message,
        details: failure.detail
      }
    } finally {
      diagnosticsHandle?.dispose()

      if (client) {
        try {
          await client.close()
        } catch {
          void 0
        }
      }
    }
  }

  public getDiscoveredTools(): DiscoveredMcpTool[] {
    return [...this.discoveredTools]
  }

  public async callTool(
    serverId: string,
    toolName: string,
    args: { [key: string]: unknown } | undefined
  ): Promise<unknown> {
    const client = this.clients.get(serverId)
    if (!client) {
      const config = this.serverConfigs.get(serverId)
      const runtimeStatus = this.runtimeStatuses.get(serverId)
      const serverLabel = config?.name || serverId

      if (runtimeStatus?.state === 'error' && runtimeStatus.error) {
        throw new Error(`MCP server "${serverLabel}" is unavailable: ${runtimeStatus.error}`)
      }

      throw new Error(`Not connected to MCP server "${serverLabel}".`)
    }

    return client.callTool({ name: toolName, arguments: args })
  }

  public async shutdown(): Promise<void> {
    this.isShuttingDown = true

    for (const serverId of Array.from(this.clients.keys())) {
      await this.disconnectServer(serverId)
    }

    this.clients.clear()
    this.discoveredTools = []
    this.runtimeStatuses.clear()
  }

  private async loadMcpServersAndDiscoverTools(): Promise<void> {
    try {
      const serverConfigs = await this.settingsService.getMcpServerConfigurations()
      await this.syncServerConfigurations(serverConfigs)
    } catch {
      void 0
    }
  }

  private async syncServerConfigurations(serverConfigs: McpServerConfig[]): Promise<void> {
    const nextServerIds = new Set(serverConfigs.map((config) => config.id))

    for (const existingServerId of Array.from(this.serverConfigs.keys())) {
      if (!nextServerIds.has(existingServerId)) {
        await this.removeServerConfiguration(existingServerId)
      }
    }

    for (const config of serverConfigs) {
      await this.upsertServerConfiguration(config)
    }
  }

  private createTransport(
    config: Pick<McpServerConfig, 'command' | 'args' | 'url'>
  ): StdioClientTransport | SSEClientTransport | null {
    if (config.command) {
      const safeCommand = ensureLocalCommandOrExecutable(config.command)
      return new StdioClientTransport({
        command: safeCommand,
        args: config.args || [],
        stderr: 'pipe'
      })
    }

    if (config.url) {
      try {
        return new SSEClientTransport(new URL(config.url))
      } catch {
        return null
      }
    }

    return null
  }

  private attachTransportDiagnostics(
    transport: StdioClientTransport | SSEClientTransport
  ): TransportDiagnosticsHandle {
    if (!(transport instanceof StdioClientTransport)) {
      return {
        dispose: () => void 0,
        getDetail: () => undefined
      }
    }

    const stderrStream = transport.stderr as Stream | null
    if (!stderrStream) {
      return {
        dispose: () => void 0,
        getDetail: () => undefined
      }
    }

    let detail: string | undefined
    const onData = (chunk: Buffer | string): void => {
      const nextChunk = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      detail = appendMcpRuntimeDetail(detail, nextChunk)
    }

    stderrStream.on('data', onData)

    return {
      dispose: () => {
        stderrStream.removeListener('data', onData)
      },
      getDetail: () => detail
    }
  }

  private async connectToServerAndDiscover(
    config: McpServerConfig,
    replaceExisting = false
  ): Promise<void> {
    if (replaceExisting) {
      await this.disconnectServer(config.id)
    } else if (this.clients.has(config.id)) {
      return
    }

    const toolCount = this.discoveredTools.filter((tool) => tool.serverId === config.id).length
    this.setRuntimeStatus(
      this.buildRuntimeStatus(config, 'connecting', {
        toolCount
      })
    )

    let client: Client | null = null
    let diagnosticsHandle: TransportDiagnosticsHandle | null = null

    try {
      const transport = this.createTransport(config)
      if (!transport) {
        this.setRuntimeStatus(
          this.buildRuntimeStatus(config, 'error', {
            toolCount: 0,
            error: 'Provide a command for stdio or a valid URL for HTTP-based MCP servers.'
          })
        )
        return
      }

      diagnosticsHandle = this.attachTransportDiagnostics(transport)
      client = new Client({ name: 'ArionMCPClient', version: '0.1.0' })
      await client.connect(transport)

      const serverVersion = this.safeGetServerVersion(client)
      const discoveredTools = await this.discoverTools(config.id, client)

      this.clients.set(config.id, client)
      this.replaceDiscoveredTools(config.id, discoveredTools)

      client.onclose = () => {
        this.clients.delete(config.id)
        this.replaceDiscoveredTools(config.id, [])
        diagnosticsHandle?.dispose()

        const latestConfig = this.serverConfigs.get(config.id)
        if (this.isShuttingDown || !latestConfig?.enabled) {
          return
        }

        this.setRuntimeStatus(
          this.buildRuntimeStatus(latestConfig, 'error', {
            toolCount: 0,
            error: 'Connection closed.',
            detail: diagnosticsHandle?.getDetail()
          })
        )
      }

      this.setRuntimeStatus(
        this.buildRuntimeStatus(config, 'connected', {
          serverName: serverVersion?.name,
          serverVersion: serverVersion?.version,
          toolCount: discoveredTools.length
        })
      )
    } catch (error) {
      const failure = summarizeMcpRuntimeFailure(error, diagnosticsHandle?.getDetail())
      this.replaceDiscoveredTools(config.id, [])
      this.setRuntimeStatus(
        this.buildRuntimeStatus(config, 'error', {
          toolCount: 0,
          error: failure.message,
          detail: failure.detail
        })
      )

      diagnosticsHandle?.dispose()

      if (client) {
        try {
          await client.close()
        } catch {
          void 0
        }
      }
    }
  }

  private async disconnectServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId)
    this.clients.delete(serverId)
    this.replaceDiscoveredTools(serverId, [])

    if (!client) {
      return
    }

    client.onclose = undefined

    try {
      await client.close()
    } catch {
      void 0
    }
  }

  private async discoverTools(serverId: string, client: Client): Promise<DiscoveredMcpTool[]> {
    const listToolsResponse = (await client.listTools()) as ListToolsResult
    const actualToolsArray = Array.isArray(listToolsResponse?.tools) ? listToolsResponse.tools : []

    return actualToolsArray.map((tool: Tool) => ({
      ...tool,
      serverId
    }))
  }

  private safeGetServerVersion(client: Client): Implementation | undefined {
    try {
      return client.getServerVersion()
    } catch {
      return undefined
    }
  }

  private shouldReconnectServer(
    previousConfig: McpServerConfig | undefined,
    nextConfig: McpServerConfig
  ): boolean {
    if (!previousConfig) {
      return true
    }

    if (!this.clients.has(nextConfig.id)) {
      return true
    }

    if (previousConfig.command !== nextConfig.command || previousConfig.url !== nextConfig.url) {
      return true
    }

    const previousArgs = JSON.stringify(previousConfig.args || [])
    const nextArgs = JSON.stringify(nextConfig.args || [])
    return previousArgs !== nextArgs
  }

  private replaceDiscoveredTools(serverId: string, nextTools: DiscoveredMcpTool[]): void {
    this.discoveredTools = [
      ...this.discoveredTools.filter((currentTool) => currentTool.serverId !== serverId),
      ...nextTools
    ]
    this.emit('tools-updated')
  }

  private buildRuntimeStatus(
    config: McpServerConfig,
    state: McpServerRuntimeStatus['state'],
    updates: Partial<
      Omit<McpServerRuntimeStatus, 'serverId' | 'state' | 'transport' | 'updatedAt'>
    > = {}
  ): McpServerRuntimeStatus {
    return {
      serverId: config.id,
      state,
      transport: config.url ? 'http' : 'stdio',
      updatedAt: new Date().toISOString(),
      ...updates
    }
  }

  private setRuntimeStatus(status: McpServerRuntimeStatus): void {
    this.runtimeStatuses.set(status.serverId, status)
    this.emit('runtime-status', status)
  }
}
