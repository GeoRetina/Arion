import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

vi.mock('ai', () => ({
  tool: vi.fn((definition: unknown) => ({ kind: 'tool', ...(definition as object) })),
  dynamicTool: vi.fn((definition: unknown) => ({
    kind: 'dynamic-tool',
    ...(definition as object)
  }))
}))

import { dynamicTool, tool } from 'ai'
import { ToolRegistry } from './tool-registry'

describe('ToolRegistry', () => {
  it('registers valid tools and ignores duplicates/invalid entries', () => {
    const registry = new ToolRegistry()

    registry.register({
      name: 'buffer',
      category: 'map',
      definition: {
        description: 'Buffer geometry',
        inputSchema: z.object({ distance: z.number() })
      },
      execute: async () => ({ ok: true })
    })

    registry.register({
      name: 'buffer',
      category: 'map',
      definition: {
        description: 'Duplicate',
        inputSchema: z.object({})
      },
      execute: async () => ({ ok: false })
    })

    registry.register({
      name: 'invalid',
      category: 'map',
      definition: {
        description: 'Invalid',
        inputSchema: {} as never
      },
      execute: async () => ({ ok: true })
    })

    expect(registry.getAllToolNames()).toEqual(['buffer'])
    expect(registry.has('buffer')).toBe(true)
    expect(registry.has('invalid')).toBe(false)
  })

  it('creates tool definitions with allowlist filtering and dynamic tool support', async () => {
    const registry = new ToolRegistry()

    registry.register({
      name: 'buffer',
      category: 'map',
      definition: {
        description: 'Buffer geometry',
        inputSchema: z.object({ distance: z.number() })
      },
      execute: async () => ({ ok: true })
    })

    registry.register({
      name: 'query_db',
      category: 'database',
      isDynamic: true,
      definition: {
        description: 'Query database',
        inputSchema: z.object({ sql: z.string() })
      },
      execute: async () => ({ ok: true })
    })

    const executeTool = vi.fn(async (toolName: string, args: unknown) => ({ toolName, args }))
    const defs = registry.createToolDefinitions(executeTool, ['query_db'])

    expect(Object.keys(defs)).toEqual(['query_db'])
    expect(dynamicTool).toHaveBeenCalledTimes(1)
    expect(tool).not.toHaveBeenCalled()

    const result = await defs.query_db.execute({ sql: 'select 1' })
    expect(result).toEqual({ toolName: 'query_db', args: { sql: 'select 1' } })
    expect(executeTool).toHaveBeenCalledWith('query_db', { sql: 'select 1' })
  })
})
