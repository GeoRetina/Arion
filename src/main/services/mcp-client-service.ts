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
import { McpServerConfig } from '../../shared/ipc-types'

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
      console.warn(
        '[MCPClientService] ensureInitialized called before initializationPromise was set. Re-initializing.'
      )
      this.initializationPromise = this.loadMcpServersAndDiscoverTools()
    }
    return this.initializationPromise
  }

  // Renamed and refactored to be the core of initialization
  private async loadMcpServersAndDiscoverTools(): Promise<void> {
    console.log(
      '[MCPClientService] Starting to load MCP server configurations and discover tools...'
    )
    try {
      const serverConfigs = await this.settingsService.getMcpServerConfigurations()
      console.log('[MCPClientService] Loaded server configs:', serverConfigs)

      const connectionPromises = serverConfigs
        .filter((config) => config.enabled)
        .map((config) => this.connectToServerAndDiscover(config)) // Changed to connect and discover

      await Promise.allSettled(connectionPromises) // Wait for all connections and discoveries to attempt
      console.log(
        '[MCPClientService] Finished attempting all server connections and tool discoveries.'
      )
    } catch (error) {
      console.error(
        '[MCPClientService] Critical error during loadMcpServersAndDiscoverTools:',
        error
      )
      // Depending on desired behavior, could re-throw or handle
    }
  }

  // Combined connection and discovery logic for a single server
  private async connectToServerAndDiscover(config: McpServerConfig): Promise<void> {
    if (this.clients.has(config.id)) {
      console.log(
        `[MCPClientService] Already connected or attempting to connect to MCP server: ${config.name} (ID: ${config.id})`
      )
      // Potentially re-discover tools if already connected but ensureInitialized is called again?
      // For now, if connected, assume tools are discovered or will be handled by onclose/reconnect logic.
      return
    }

    console.log(
      `[MCPClientService] Attempting to connect and discover tools for MCP server "${config.name}" (ID: ${config.id})`
    )

    try {
      const client = new Client({ name: 'ArionMCPClient', version: '0.1.0' })
      let transport

      if (config.command) {
        // Stdio transport
        console.log(
          `[MCPClientService] Connecting to "${config.name}" via stdio command: ${config.command} ${config.args?.join(' ') || ''}`
        )
        transport = new StdioClientTransport({
          command: config.command,
          args: config.args || []
          // TODO: Consider adding `cwd` or `env` if necessary from config
        })
      } else if (config.url) {
        console.log(
          `[MCPClientService] Connecting to "${config.name}" via SSE to URL: ${config.url}`
        )
        try {
          transport = new SSEClientTransport(new URL(config.url))
        } catch (e) {
          console.error(
            `[MCPClientService] Invalid URL for SSE server ${config.name}: ${config.url}`,
            e
          )
          return // Stop if URL is invalid for SSE transport
        }
      } else {
        console.error(
          `[MCPClientService] Server config "${config.name}" (ID: ${config.id}) is missing 'command' or 'url'.`
        )
        return
      }

      // If transport is not created (e.g. invalid URL for SSE), we would have returned.
      // So, if we reach here, transport should be defined.
      if (!transport) {
        console.error(`[MCPClientService] Transport could not be initialized for ${config.name}.`)
        return
      }

      await client.connect(transport)
      this.clients.set(config.id, client)
      console.log(
        `[MCPClientService] Successfully connected to MCP server: ${config.name} (ID: ${config.id})`
      )

      try {
        // Use getServerVersion() and getServerCapabilities()
        const serverVersion: Implementation | undefined = client.getServerVersion()
        const serverCaps: ServerCapabilities | undefined = client.getServerCapabilities()

        if (serverVersion) {
          console.log(
            `[MCPClientService] Server Version for ${config.name} (ID: ${config.id}): ${serverVersion.name} v${serverVersion.version}`
          )
        } else {
          console.warn(
            `[MCPClientService] Could not get server version for ${config.name} (ID: ${config.id})`
          )
        }
        if (serverCaps) {
          console.log(
            `[MCPClientService] Server Capabilities for ${config.name} (ID: ${config.id}):`,
            serverCaps
          )
        } else {
          console.warn(
            `[MCPClientService] Could not get server capabilities for ${config.name} (ID: ${config.id})`
          )
        }
      } catch (infoError) {
        // This catch might not be strictly necessary if the getters themselves don't throw but return undefined.
        console.warn(
          `[MCPClientService] Error trying to get server version/capabilities from ${config.name} (ID: ${config.id}):`,
          infoError
        )
      }

      // Discover tools immediately after successful connection
      await this.discoverTools(config.id, client)

      client.onclose = () => {
        // Corrected to onclose (lowercase)
        console.log(
          `[MCPClientService] Disconnected from MCP server: ${config.name} (ID: ${config.id})`
        )
        this.clients.delete(config.id)
        this.discoveredTools = this.discoveredTools.filter((tool) => tool.serverId !== config.id)
        console.log(
          `[MCPClientService] Removed tools for server ${config.id}. Remaining tools: ${this.discoveredTools.length}`
        )
        // TODO: Potentially attempt to reconnect based on policy/settings
      }
    } catch (error) {
      console.error(
        `[MCPClientService] Failed to connect or communicate with MCP server ${config.name} (ID: ${config.id}):`,
        error
      )
    }
  }

  private async discoverTools(serverId: string, client: Client): Promise<void> {
    console.log(`[MCPClientService] Discovering tools for server ${serverId}...`)
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
        console.log(
          `[MCPClientService] Discovered ${newTools.length} tools from server ${serverId}:`,
          newTools.map((t) => t.name)
        )
      } else {
        console.warn(
          `[MCPClientService] listToolsResponse.tools for server ${serverId} was not an array or response was not as expected. Received:`,
          listToolsResponse
        )
        this.discoveredTools = this.discoveredTools.filter(
          (currentTool) => currentTool.serverId !== serverId
        )
      }
    } catch (error) {
      console.error(`[MCPClientService] Failed to discover tools from server ${serverId}:`, error)
      this.discoveredTools = this.discoveredTools.filter(
        (currentTool) => currentTool.serverId !== serverId
      )
    }
  }

  public getDiscoveredTools(): DiscoveredMcpTool[] {
    return [...this.discoveredTools] // Return a copy to prevent external modification
  }

  public async callTool(
    serverId: string,
    toolName: string,
    args: { [key: string]: unknown } | undefined
  ): Promise<any> {
    const client = this.clients.get(serverId)
    if (!client) {
      console.error(
        `[MCPClientService] Attempted to call tool "${toolName}" on non-connected server ID: ${serverId}`
      )
      throw new Error(`Not connected to MCP server with ID: ${serverId}`)
    }
    console.log(
      `[MCPClientService] Calling tool "${toolName}" on server "${serverId}" with args:`,
      args
    )
    try {
      const result = await client.callTool({ name: toolName, arguments: args })
      console.log(
        `[MCPClientService] Tool "${toolName}" on server "${serverId}" call result:`,
        result
      )
      return result
    } catch (error) {
      console.error(
        `[MCPClientService] Error calling tool "${toolName}" on server "${serverId}":`,
        error
      )
      throw error
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
    console.log('[MCPClientService] Shutting down and disconnecting all clients...')
    for (const [id, client] of this.clients.entries()) {
      try {
        await client.close()
        console.log(`[MCPClientService] Successfully disconnected from MCP server: ${id}`)
      } catch (error) {
        console.error(`[MCPClientService] Error disconnecting from MCP server ${id}:`, error)
      }
    }
    this.clients.clear()
    this.discoveredTools = []
    console.log('[MCPClientService] Shutdown complete.')
  }
}

// Optional: Export an instance if you want it to be a singleton managed here
// // For actual use, an instance of SettingsService would be passed here.
// // e.g. import { settingsServiceInstance } from './settings.service';
// export const mcpClientService = new MCPClientService(settingsServiceInstance);
