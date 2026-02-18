import { describe, expect, it, vi } from 'vitest'
import { McpConnectorAdapter } from './mcp-connector-adapter'

describe('McpConnectorAdapter', () => {
  it('passes only connector input fields to the mapped MCP tool', async () => {
    const callTool = vi.fn(async () => ({ ok: true }))
    const adapter = new McpConnectorAdapter({
      getDiscoveredTools: () => [
        {
          name: 'stac_search_catalog',
          serverId: 'server-a'
        }
      ],
      callTool
    } as never)

    const result = await adapter.execute(
      {
        integrationId: 'stac',
        capability: 'catalog.search',
        input: { collections: ['demo'], limit: 3 }
      },
      {
        timeoutMs: 5000,
        attempt: 0,
        maxRetries: 0
      }
    )

    expect(result.success).toBe(true)
    expect(callTool).toHaveBeenCalledWith('server-a', 'stac_search_catalog', {
      collections: ['demo'],
      limit: 3
    })
  })

  it('fails when multiple servers expose the same mapped tool without an explicit server mapping', async () => {
    const adapter = new McpConnectorAdapter({
      getDiscoveredTools: () => [
        { name: 'stac_search_catalog', serverId: 'server-a' },
        { name: 'stac_search_catalog', serverId: 'server-b' }
      ],
      callTool: vi.fn()
    } as never)

    const result = await adapter.execute(
      {
        integrationId: 'stac',
        capability: 'catalog.search',
        input: {}
      },
      {
        timeoutMs: 5000,
        attempt: 0,
        maxRetries: 0
      }
    )

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('MCP_TOOL_UNAVAILABLE')
      expect(result.error.message).toContain('Multiple MCP servers expose')
    }
  })
})
