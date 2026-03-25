import { describe, expect, it, vi } from 'vitest'
import {
  qgisListAlgorithmsToolName,
  qgisRunProcessingToolName,
  stacSearchCatalogToolName
} from '../../../llm-tools/integration-tools'
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

  it('registers and delegates the QGIS processing tool', async () => {
    const { registry, entries } = createRegistry()
    const execute = vi.fn(async () => ({
      success: true,
      runId: 'run_qgis',
      integrationId: 'qgis',
      capability: 'desktop.processing.run',
      backend: 'native',
      durationMs: 84,
      data: { operation: 'runAlgorithm' },
      details: { launcherPath: 'C:\\QGIS\\bin\\qgis_process-qgis.bat' }
    }))

    registerIntegrationTools(registry, {
      getConnectorExecutionService: () =>
        ({
          execute
        }) as never
    })

    const tool = entries.get(qgisRunProcessingToolName)
    const result = (await tool?.execute({
      args: {
        algorithmId: 'native:buffer',
        parameters: {
          DISTANCE: 10
        },
        importPreference: 'auto',
        outputsToImport: ['top_10_longest_features.geojson']
      },
      chatId: 'chat-qgis'
    })) as {
      status: string
      run_id: string
      data: { operation: string }
    }

    expect(execute).toHaveBeenCalledWith({
      integrationId: 'qgis',
      capability: 'desktop.processing.run',
      chatId: 'chat-qgis',
      input: {
        algorithmId: 'native:buffer',
        parameters: {
          DISTANCE: 10
        },
        importPreference: 'auto',
        outputsToImport: ['top_10_longest_features.geojson']
      },
      timeoutMs: undefined
    })
    expect(result).toEqual({
      status: 'success',
      run_id: 'run_qgis',
      backend: 'native',
      duration_ms: 84,
      data: { operation: 'runAlgorithm' },
      details: { launcherPath: 'C:\\QGIS\\bin\\qgis_process-qgis.bat' }
    })
  })

  it('flattens the QGIS algorithm shortlist into a model-friendly top-level shape', async () => {
    const { registry, entries } = createRegistry()
    const execute = vi.fn(async () => ({
      success: true,
      runId: 'run_qgis_list',
      integrationId: 'qgis',
      capability: 'desktop.processing.listAlgorithms',
      backend: 'native',
      durationMs: 24,
      data: {
        operation: 'listAlgorithms',
        exitCode: 0,
        version: '3.40.1',
        artifacts: [],
        outputs: [],
        importedLayers: [],
        result: {
          algorithms: [
            {
              id: 'native:orderbyexpression',
              name: 'Order by expression',
              provider: 'native',
              supportedForExecution: true
            },
            {
              id: 'native:extractbyexpression',
              name: 'Extract by expression',
              provider: 'native',
              supportedForExecution: true
            }
          ],
          totalAlgorithms: 180,
          matchedAlgorithms: 2,
          returnedAlgorithms: 2,
          truncated: false,
          filters: {
            query: 'extract the 10 longest line features',
            provider: 'native',
            limit: 10
          }
        }
      },
      details: { launcherPath: 'C:\\QGIS\\bin\\qgis_process-qgis.bat' }
    }))

    registerIntegrationTools(registry, {
      getConnectorExecutionService: () =>
        ({
          execute
        }) as never
    })

    const tool = entries.get(qgisListAlgorithmsToolName)
    const result = (await tool?.execute({
      args: {
        query: 'extract the 10 longest line features',
        provider: 'native',
        limit: 10
      },
      chatId: 'chat-qgis'
    })) as Record<string, unknown>

    expect(result).toEqual({
      status: 'success',
      run_id: 'run_qgis_list',
      backend: 'native',
      duration_ms: 24,
      operation: 'listAlgorithms',
      algorithms: [
        {
          id: 'native:orderbyexpression',
          name: 'Order by expression',
          provider: 'native',
          supportedForExecution: true
        },
        {
          id: 'native:extractbyexpression',
          name: 'Extract by expression',
          provider: 'native',
          supportedForExecution: true
        }
      ],
      shortlist: [
        {
          id: 'native:orderbyexpression',
          name: 'Order by expression',
          provider: 'native',
          supportedForExecution: true
        },
        {
          id: 'native:extractbyexpression',
          name: 'Extract by expression',
          provider: 'native',
          supportedForExecution: true
        }
      ],
      total_algorithms: 180,
      matched_algorithms: 2,
      returned_algorithms: 2,
      truncated: false,
      filters: {
        query: 'extract the 10 longest line features',
        provider: 'native',
        limit: 10
      },
      data: {
        operation: 'listAlgorithms',
        exitCode: 0,
        version: '3.40.1',
        artifacts: [],
        outputs: [],
        importedLayers: [],
        result: {
          algorithms: [
            {
              id: 'native:orderbyexpression',
              name: 'Order by expression',
              provider: 'native',
              supportedForExecution: true
            },
            {
              id: 'native:extractbyexpression',
              name: 'Extract by expression',
              provider: 'native',
              supportedForExecution: true
            }
          ],
          totalAlgorithms: 180,
          matchedAlgorithms: 2,
          returnedAlgorithms: 2,
          truncated: false,
          filters: {
            query: 'extract the 10 longest line features',
            provider: 'native',
            limit: 10
          }
        }
      },
      details: { launcherPath: 'C:\\QGIS\\bin\\qgis_process-qgis.bat' }
    })
  })

  it('does not register bespoke QGIS analysis helpers', async () => {
    const { registry, entries } = createRegistry()
    registerIntegrationTools(registry, {
      getConnectorExecutionService: () =>
        ({
          execute: vi.fn()
        }) as never
    })

    expect(entries.has('qgis_extract_top_features')).toBe(false)
  })
})
