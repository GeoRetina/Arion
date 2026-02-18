import { describe, expect, it } from 'vitest'
import { ConnectorCapabilityRegistry } from './connector-capability-registry'
import type { ConnectorAdapter } from './adapters/connector-adapter'

const createAdapter = (id: string, backend: 'native' | 'mcp' | 'plugin'): ConnectorAdapter => ({
  id,
  backend,
  supports: () => true,
  execute: async () => ({
    success: true,
    data: { id, backend }
  })
})

describe('ConnectorCapabilityRegistry', () => {
  it('resolves routes by backend preference when provided', () => {
    const registry = new ConnectorCapabilityRegistry()
    registry.register({
      integrationId: 'stac',
      capability: 'catalog.search',
      adapter: createAdapter('native-a', 'native')
    })
    registry.register({
      integrationId: 'stac',
      capability: 'catalog.search',
      adapter: createAdapter('mcp-a', 'mcp')
    })

    const resolved = registry.resolve('stac', 'catalog.search', ['mcp', 'native'], [])
    expect(resolved).toHaveLength(2)
    expect(resolved[0]?.adapter.backend).toBe('mcp')
    expect(resolved[1]?.adapter.backend).toBe('native')
  })

  it('aggregates registrations into capability metadata', () => {
    const registry = new ConnectorCapabilityRegistry()
    registry.register({
      integrationId: 'postgresql-postgis',
      capability: 'sql.query',
      adapter: createAdapter('native-sql', 'native'),
      sensitivity: 'sensitive',
      description: 'Run SQL query'
    })
    registry.register({
      integrationId: 'postgresql-postgis',
      capability: 'sql.query',
      adapter: createAdapter('mcp-sql', 'mcp')
    })

    const capabilities = registry.listCapabilities()
    expect(capabilities).toEqual([
      {
        integrationId: 'postgresql-postgis',
        capability: 'sql.query',
        backends: ['native', 'mcp'],
        sensitivity: 'sensitive',
        description: 'Run SQL query'
      }
    ])
  })
})
