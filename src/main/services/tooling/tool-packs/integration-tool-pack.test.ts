import { describe, expect, it, vi } from 'vitest'
import { stacSearchCatalogToolName } from '../../../llm-tools/integration-tools'
import { registerIntegrationTools } from './integration-tool-pack'

function createRegistry(): {
  registry: never
  entries: Map<
    string,
    { execute: (params: { args: unknown; chatId?: string }) => Promise<unknown> }
  >
} {
  const entries = new Map<
    string,
    { execute: (params: { args: unknown; chatId?: string }) => Promise<unknown> }
  >()
  return {
    registry: {
      register: (tool: {
        name: string
        execute: (params: { args: unknown; chatId?: string }) => Promise<unknown>
      }) => {
        entries.set(tool.name, { execute: tool.execute })
      }
    } as never,
    entries
  }
}

describe('registerIntegrationTools', () => {
  it('returns an error when connector execution service is unavailable', async () => {
    const { registry, entries } = createRegistry()
    registerIntegrationTools(registry, {
      getConnectorExecutionService: () => null
    })

    const tool = entries.get(stacSearchCatalogToolName)
    const result = (await tool?.execute({ args: {} })) as { status: string; message: string }

    expect(result.status).toBe('error')
    expect(result.message).toContain('not configured')
  })

  it('delegates capability execution and returns a stable success shape', async () => {
    const { registry, entries } = createRegistry()
    const execute = vi.fn(async () => ({
      success: true,
      runId: 'run_1',
      integrationId: 'stac',
      capability: 'catalog.search',
      backend: 'native',
      durationMs: 42,
      data: { returned: 2 },
      details: { source: 'native' }
    }))

    registerIntegrationTools(registry, {
      getConnectorExecutionService: () =>
        ({
          execute
        }) as never
    })

    const tool = entries.get(stacSearchCatalogToolName)
    const result = (await tool?.execute({
      args: { collections: ['demo'], limit: 2 },
      chatId: 'chat-123'
    })) as {
      status: string
      run_id: string
      backend: string
      data: { returned: number }
    }

    expect(execute).toHaveBeenCalledWith({
      integrationId: 'stac',
      capability: 'catalog.search',
      chatId: 'chat-123',
      input: { collections: ['demo'], limit: 2 },
      timeoutMs: undefined
    })
    expect(result).toEqual({
      status: 'success',
      run_id: 'run_1',
      backend: 'native',
      duration_ms: 42,
      data: { returned: 2 },
      details: { source: 'native' }
    })
  })
})
