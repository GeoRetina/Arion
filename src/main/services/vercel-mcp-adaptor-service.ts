import { experimental_createMCPClient } from 'ai'
import { Experimental_StdioMCPTransport } from 'ai/mcp-stdio'
import { McpServerConfig } from '../../shared/ipc-types'

/**
 * Represents the result of setting up Vercel MCP integration.
 */
export interface VercelMcpSetupResult {
  /** The aggregated tools object compatible with Vercel AI SDK functions like streamText. */
  tools: Record<string, any> // Using Record<string, any> for simplicity, as the structure is dynamic based on server tools
  /** An array of active Vercel MCP client instances that need to be closed after use. */
  activeClients: Array<{ close: () => Promise<void> }>
}

/**
 * Sets up integration with MCP servers using the Vercel AI SDK's experimental_createMCPClient.
 * It initializes clients for each active MCP server configuration and aggregates their tools.
 *
 * @param activeMcpConfigs An array of active McpServerConfig objects.
 * @returns A Promise resolving to a VercelMcpSetupResult containing aggregated tools and active client instances.
 */
export async function setupVercelMcpIntegration(
  activeMcpConfigs: McpServerConfig[]
): Promise<VercelMcpSetupResult> {
  const activeClients: Array<{ close: () => Promise<void> }> = []
  let aggregatedTools: Record<string, any> = {}

  console.log(
    `[VercelMcpUtils] Setting up Vercel MCP integration for ${activeMcpConfigs.length} active configurations.`
  )

  for (const config of activeMcpConfigs) {
    let transport
    if (config.command) {
      console.log(
        `[VercelMcpUtils] Configuring Vercel MCP client for Stdio server: ${config.name} (Command: ${config.command} ${config.args?.join(' ') || ''})`
      )
      transport = new Experimental_StdioMCPTransport({
        command: config.command,
        args: config.args || []
      })
    } else if (config.url) {
      console.log(
        `[VercelMcpUtils] Configuring Vercel MCP client for SSE server: ${config.name} (URL: ${config.url})`
      )
      transport = {
        type: 'sse',
        url: config.url
        // TODO: Add headers from config if Vercel SDK supports it & we add to McpServerConfig
      }
    } else {
      console.warn(
        `[VercelMcpUtils] Skipping MCP server ${config.name} due to missing transport info (command or URL).`
      )
      continue
    }

    if (transport) {
      try {
        const mcpClient = await experimental_createMCPClient({ transport })
        activeClients.push(mcpClient)
        const toolsFromServer = await mcpClient.tools() // Returns tools in the format expected by Vercel AI SDK
        aggregatedTools = { ...aggregatedTools, ...toolsFromServer }
        console.log(
          `[VercelMcpUtils] Successfully connected to Vercel MCP client for ${config.name} and fetched ${Object.keys(toolsFromServer).length} tools.`
        )
      } catch (mcpClientError) {
        console.error(
          `[VercelMcpUtils] Failed to create Vercel MCP client or get tools for ${config.name}:`,
          mcpClientError
        )
      }
    }
  }

  if (Object.keys(aggregatedTools).length > 0) {
    console.log(
      `[VercelMcpUtils] Aggregated ${Object.keys(aggregatedTools).length} MCP tools for Vercel AI SDK.`
    )
  }

  return { tools: aggregatedTools, activeClients }
}

/**
 * Closes all provided Vercel MCP client instances.
 *
 * @param clients An array of Vercel MCP client instances to close.
 */
export async function cleanupVercelMcpClients(
  clients: Array<{ close: () => Promise<void> }>
): Promise<void> {
  if (clients.length === 0) {
    return
  }
  console.log(`[VercelMcpUtils] Cleaning up ${clients.length} Vercel MCP clients.`)
  for (const client of clients) {
    try {
      await client.close()
      console.log('[VercelMcpUtils] Closed a Vercel MCP client.')
    } catch (closeError) {
      console.error('[VercelMcpUtils] Error closing Vercel MCP client:', closeError)
    }
  }
}
