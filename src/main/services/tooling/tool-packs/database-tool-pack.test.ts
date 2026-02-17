import { describe, expect, it, vi } from 'vitest'
import { listDatabaseConnectionsToolName } from '../../../llm-tools/database-tools/list-database-connections-tool'
import { registerDatabaseTools } from './database-tool-pack'

function createRegistry(): {
  registry: never
  entries: Map<string, { execute: () => Promise<unknown> }>
} {
  const entries = new Map<string, { execute: () => Promise<unknown> }>()
  return {
    registry: {
      register: (tool: { name: string; execute: () => Promise<unknown> }) => {
        entries.set(tool.name, { execute: tool.execute })
      }
    } as never,
    entries
  }
}

describe('registerDatabaseTools', () => {
  it('returns an error when PostgreSQL service is unavailable', async () => {
    const { registry, entries } = createRegistry()
    registerDatabaseTools(registry, { getPostgresqlService: () => null })

    const tool = entries.get(listDatabaseConnectionsToolName)
    const result = (await tool?.execute()) as { status: string; message: string }

    expect(result).toEqual({
      status: 'error',
      message: 'PostgreSQL Service is not configured.'
    })
  })

  it('lists active connections with placeholder credentials', async () => {
    const { registry, entries } = createRegistry()

    const getActiveConnections = vi.fn(async () => ['conn_a'])
    const getConnectionInfo = vi.fn(async () => ({ connected: true }))

    registerDatabaseTools(registry, {
      getPostgresqlService: () =>
        ({
          getActiveConnections,
          getConnectionInfo
        }) as never
    })

    const tool = entries.get(listDatabaseConnectionsToolName)
    const result = (await tool?.execute()) as {
      status: string
      connections: Array<Record<string, unknown>>
      placeholder_note: string
    }

    expect(result.status).toBe('success')
    expect(result.connections).toEqual([
      {
        id: 'conn_a',
        name: 'conn_a',
        host: 'host',
        port: 'port',
        database: 'db_name',
        username: 'username',
        password: 'password',
        ssl: 'ssl',
        connected: true
      }
    ])
    expect(result.placeholder_note).toContain('placeholder')
  })

  it('returns error if service calls fail', async () => {
    const { registry, entries } = createRegistry()
    registerDatabaseTools(registry, {
      getPostgresqlService: () =>
        ({
          getActiveConnections: vi.fn(async () => {
            throw new Error('db down')
          })
        }) as never
    })

    const tool = entries.get(listDatabaseConnectionsToolName)
    const result = (await tool?.execute()) as { status: string; message: string }

    expect(result.status).toBe('error')
    expect(result.message).toContain('db down')
  })
})
