import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import {
  /* ServerInfo, */ Tool,
  ListToolsResult,
  Implementation,
  ServerCapabilities
} from '@modelcontextprotocol/sdk/types.js'
import { SettingsService } from './settings-service'
import { McpServerConfig, McpServerTestResult } from '../../shared/ipc-types'

// Interface for a discovered MCP tool
export interface DiscoveredMcpTool extends Tool {
  serverId: string // To know which server this tool belongs to
}

export class MCPClientService {
  private settingsService: SettingsService
  private clients: Map<string, Client> = new Map()
  private discoveredTools: DiscoveredMcpTool[] = []
  private initializationPromise: Promise<void> | null = null // For tracking initialization

  constructor(settingsService: SettingsService) {
    this.settingsService = settingsService
    // Don't await here, let it run in the background.
    // The initialize method will handle the promise.
    this.initializationPromise = this.loadMcpServersAndDiscoverTools()
  }

  // Public method to await initialization
  public async ensureInitialized(): Promise<void> {
    if (!this.initializationPromise) {
      // This case should ideally not be hit if constructor logic is sound
      this.initializationPromise = this.loadMcpServersAndDiscoverTools()
    }
    return this.initializationPromise
  }

  // Renamed and refactored to be the core of initialization
  private async loadMcpServersAndDiscoverTools(): Promise<void> {
    try {
      const serverConfigs = await this.settingsService.getMcpServerConfigurations()

      const connectionPromises = serverConfigs
        .filter((config) => config.enabled)
        .map((config) => this.connectToServerAndDiscover(config)) // Changed to connect and discover

      await Promise.allSettled(connectionPromises) // Wait for all connections and discoveries to attempt
    } catch {
      // Depending on desired behavior, could re-throw or handle
    }
  }

  private createTransport(
    config: Pick<McpServerConfig, 'command' | 'args' | 'url'>
  ): StdioClientTransport | SSEClientTransport | null {
    if (config.command) {
      return new StdioClientTransport({
        command: config.command,
        args: config.args || []
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

  // Combined connection and discovery logic for a single server
  private async connectToServerAndDiscover(config: McpServerConfig): Promise<void> {
    if (this.clients.has(config.id)) {
      // Potentially re-discover tools if already connected but ensureInitialized is called again?
      // For now, if connected, assume tools are discovered or will be handled by onclose/reconnect logic.
      return
    }

    try {
      const transport = this.createTransport(config)
      if (!transport) {
        return
      }

      const client = new Client({ name: 'ArionMCPClient', version: '0.1.0' })
      await client.connect(transport)
      this.clients.set(config.id, client)

      try {
        // Use getServerVersion() and getServerCapabilities()
        const serverVersion: Implementation | undefined = client.getServerVersion()
        const serverCaps: ServerCapabilities | undefined = client.getServerCapabilities()

        if (serverVersion) {
          void 0
        } else {
          void 0
        }
        if (serverCaps) {
          void 0
        } else {
          void 0
        }
      } catch {
        // This catch might not be strictly necessary if the getters themselves don't throw but return undefined.
      }

      // Discover tools immediately after successful connection
      await this.discoverTools(config.id, client)

      client.onclose = () => {
        // Corrected to onclose (lowercase)
        this.clients.delete(config.id)
        this.discoveredTools = this.discoveredTools.filter((tool) => tool.serverId !== config.id)
        // TODO: Potentially attempt to reconnect based on policy/settings
      }
    } catch {
      void 0
    }
  }

  private async discoverTools(serverId: string, client: Client): Promise<void> {
    try {
      const listToolsResponse = (await client.listTools()) as ListToolsResult
      const actualToolsArray: Tool[] | undefined = listToolsResponse?.tools

      if (Array.isArray(actualToolsArray)) {
        const newTools: DiscoveredMcpTool[] = actualToolsArray.map((tool: Tool) => ({
          ...tool,
          serverId: serverId
        }))

        this.discoveredTools = [
          ...this.discoveredTools.filter((currentTool) => currentTool.serverId !== serverId),
          ...newTools
        ]
      } else {
        this.discoveredTools = this.discoveredTools.filter(
          (currentTool) => currentTool.serverId !== serverId
        )
      }
    } catch {
      this.discoveredTools = this.discoveredTools.filter(
        (currentTool) => currentTool.serverId !== serverId
      )
    }
  }

  public async testServerConnection(
    config: Omit<McpServerConfig, 'id'>
  ): Promise<McpServerTestResult> {
    let client: Client | null = null

    try {
      const transport = this.createTransport(config)
      if (!transport) {
        return {
          success: false,
          error: 'Provide a command for stdio or a valid URL for HTTP-based MCP servers.'
        }
      }

      client = new Client({ name: 'ArionMCPClient', version: '0.1.0' })
      await client.connect(transport)

      const serverVersion: Implementation | undefined = client.getServerVersion()
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
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to connect to MCP server.'
      }
    } finally {
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
    return [...this.discoveredTools] // Return a copy to prevent external modification
  }

  public async callTool(
    serverId: string,
    toolName: string,
    args: { [key: string]: unknown } | undefined
  ): Promise<unknown> {
    const client = this.clients.get(serverId)
    if (!client) {
      throw new Error(`Not connected to MCP server with ID: ${serverId}`)
    }
    {
      const result = await client.callTool({ name: toolName, arguments: args })
      return result
    }
  }

  // Example: Connect to a dummy server for testing if needed (would be called by loadMcpServers)
  // public async testWithDummyServer() { // Renamed to avoid confusion with constructor logic
  //   const dummyConfig: McpServerConfig = {
  //     id: 'dummy-server',
  //     name: 'Dummy Echo Server',
  //     command: 'node', // Assuming you have a simple echo MCP server script
  //     args: ['./path/to/your/dummy-mcp-echo-server.js'], // Adjust path - MAKE SURE THIS SCRIPT EXISTS AND IS EXECUTABLE
  //     enabled: true,
  //   };
  //   await this.connectToServer(dummyConfig);
  // }

  public async shutdown(): Promise<void> {
    for (const [, client] of this.clients.entries()) {
      try {
        await client.close()
      } catch {
        void 0
      }
    }
    this.clients.clear()
    this.discoveredTools = []
  }
}

// Optional: Export an instance if you want it to be a singleton managed here
// // For actual use, an instance of SettingsService would be passed here.
// // e.g. import { settingsServiceInstance } from './settings.service';
// export const mcpClientService = new MCPClientService(settingsServiceInstance);
