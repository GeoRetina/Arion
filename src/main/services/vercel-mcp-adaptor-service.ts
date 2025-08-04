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

  for (const config of activeMcpConfigs) {
    let transport
    if (config.command) {
      transport = new Experimental_StdioMCPTransport({
        command: config.command,
        args: config.args || []
      })
    } else if (config.url) {
      transport = {
        type: 'sse',
        url: config.url
        // TODO: Add headers from config if Vercel SDK supports it & we add to McpServerConfig
      }
    } else {
      continue
    }

    if (transport) {
      try {
        const mcpClient = await experimental_createMCPClient({ transport })
        activeClients.push(mcpClient)
        const toolsFromServer = await mcpClient.tools() // Returns tools in the format expected by Vercel AI SDK
        aggregatedTools = { ...aggregatedTools, ...toolsFromServer }
      } catch (mcpClientError) {}
    }
  }

  if (Object.keys(aggregatedTools).length > 0) {
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
  for (const client of clients) {
    try {
      await client.close()
    } catch (closeError) {}
  }
}
