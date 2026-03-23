import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeConnectorAdapter } from './native-connector-adapter'

const originalFetch = globalThis.fetch

const createAdapter = (
  configById: Record<string, Record<string, unknown> | null> = {
    'postgresql-postgis': {
      host: 'localhost',
      port: 5432,
      database: 'gis',
      username: 'user',
      password: 'secret',
      ssl: false
    }
  }
): NativeConnectorAdapter => {
  return new NativeConnectorAdapter(
    {
      getConfig: vi.fn(async (id: string) => configById[id] || null)
    } as never,
    {
      getConnectionInfo: vi.fn(async () => ({ connected: true, config: {} })),
      executeQuery: vi.fn()
    } as never,
    {
      listAlgorithms: vi.fn(),
      describeAlgorithm: vi.fn(),
      runAlgorithm: vi.fn(),
      applyLayerStyle: vi.fn(),
      exportLayout: vi.fn()
    } as never
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  globalThis.fetch = originalFetch
})

describe('NativeConnectorAdapter', () => {
  it('rejects write access toggles for the safe SQL capability', async () => {
    const adapter = createAdapter()
    const result = await adapter.execute(
      {
        integrationId: 'postgresql-postgis',
        capability: 'sql.query',
        input: {
          query: 'SELECT 1',
          readOnly: false
        }
      },
      {
        timeoutMs: 5000,
        attempt: 0,
        maxRetries: 0
      }
    )

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_FAILED')
      expect(result.error.message).toContain('read-only')
    }
  })

  it('rejects mutating SQL hidden inside WITH statements', async () => {
    const adapter = createAdapter()
    const result = await adapter.execute(
      {
        integrationId: 'postgresql-postgis',
        capability: 'sql.query',
        input: {
          query: 'WITH x AS (DELETE FROM my_table RETURNING id) SELECT * FROM x'
        }
      },
      {
        timeoutMs: 5000,
        attempt: 0,
        maxRetries: 0
      }
    )

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_FAILED')
      expect(result.error.message).toContain('Mutating SQL keywords')
    }
  })

  it('inspects COG metadata from TIFF header bytes', async () => {
    const adapter = createAdapter({
      cog: {
        url: 'https://example.com/sample.tif',
        timeoutMs: 5000
      }
    })

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return new Response('', {
          status: 200,
          headers: {
            'content-length': '1024',
            'content-type': 'image/tiff',
            'accept-ranges': 'bytes'
          }
        })
      }

      return new Response(new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]), {
        status: 206,
        headers: {
          'content-range': 'bytes 0-7/1024',
          'content-length': '8'
        }
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await adapter.execute(
      {
        integrationId: 'cog',
        capability: 'raster.inspectMetadata',
        input: {
          includeHeaderHex: true
        }
      },
      {
        timeoutMs: 5000,
        attempt: 0,
        maxRetries: 0
      }
    )

    expect(result.success).toBe(true)
    if (result.success) {
      const data = result.data as Record<string, unknown>
      const tiff = data.tiff as Record<string, unknown>
      expect(tiff.format).toBe('ClassicTIFF')
      expect(tiff.firstIfdOffset).toBe(8)
      expect(typeof data.headerHex).toBe('string')
    }
  })

  it('inspects PMTiles archive header metadata', async () => {
    const adapter = createAdapter({
      pmtiles: {
        url: 'https://example.com/world.pmtiles',
        timeoutMs: 5000
      }
    })

    const header = new Uint8Array(127)
    header.set(new TextEncoder().encode('PMTiles'), 0)
    header[7] = 3
    const view = new DataView(header.buffer)
    view.setBigUint64(8, 127n, true)
    view.setBigUint64(16, 64n, true)
    view.setBigUint64(24, 191n, true)
    view.setBigUint64(32, 128n, true)
    view.setBigUint64(40, 319n, true)
    view.setBigUint64(48, 256n, true)
    view.setBigUint64(56, 575n, true)
    view.setBigUint64(64, 4096n, true)
    view.setBigUint64(72, 1000n, true)
    view.setBigUint64(80, 900n, true)
    view.setBigUint64(88, 850n, true)
    view.setUint8(96, 1)
    view.setUint8(97, 1)
    view.setUint8(98, 1)
    view.setUint8(99, 1)
    view.setUint8(100, 0)
    view.setUint8(101, 12)
    view.setInt32(102, -1800000000, true)
    view.setInt32(106, -850000000, true)
    view.setInt32(110, 1800000000, true)
    view.setInt32(114, 850000000, true)
    view.setUint8(118, 3)
    view.setInt32(119, 0, true)
    view.setInt32(123, 0, true)

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return new Response('', {
          status: 200,
          headers: {
            'content-length': '5000000',
            'content-type': 'application/octet-stream',
            'accept-ranges': 'bytes'
          }
        })
      }

      return new Response(header, {
        status: 206,
        headers: {
          'content-range': 'bytes 0-126/5000000',
          'content-length': '127'
        }
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await adapter.execute(
      {
        integrationId: 'pmtiles',
        capability: 'tiles.inspectArchive',
        input: {}
      },
      {
        timeoutMs: 5000,
        attempt: 0,
        maxRetries: 0
      }
    )

    expect(result.success).toBe(true)
    if (result.success) {
      const data = result.data as Record<string, unknown>
      const pmtiles = data.pmtiles as Record<string, unknown>
      expect(pmtiles.version).toBe(3)
      expect(pmtiles.layout).toBeDefined()
      expect(pmtiles.bounds).toBeDefined()
    }
  })

  it('maps QGIS processing failures into connector errors', async () => {
    const qgisProcessService = {
      listAlgorithms: vi.fn(),
      describeAlgorithm: vi.fn(),
      runAlgorithm: vi.fn(async () => ({
        success: false,
        operation: 'runAlgorithm',
        stdout: '',
        stderr: '',
        exitCode: -1,
        durationMs: 0,
        errorCode: 'DISALLOWED_PROVIDER',
        message: 'Provider "saga" is not allowed by the current QGIS policy.',
        diagnostics: {
          launcherPath: 'C:\\QGIS\\bin\\qgis_process-qgis.bat',
          workspacePath: 'C:\\workspace',
          outputDirectory: 'C:\\workspace\\outputs',
          discoveryDiagnostics: []
        }
      })),
      applyLayerStyle: vi.fn(),
      exportLayout: vi.fn()
    }

    const adapter = new NativeConnectorAdapter(
      {
        getConfig: vi.fn(async () => ({ detectionMode: 'auto' }))
      } as never,
      {
        getConnectionInfo: vi.fn(async () => ({ connected: true, config: {} })),
        executeQuery: vi.fn()
      } as never,
      qgisProcessService as never
    )

    const result = await adapter.execute(
      {
        integrationId: 'qgis',
        capability: 'desktop.processing.run',
        chatId: 'chat-qgis',
        input: {
          algorithmId: 'saga:buffer'
        }
      },
      {
        timeoutMs: 5000,
        attempt: 0,
        maxRetries: 0
      }
    )

    expect(qgisProcessService.runAlgorithm).toHaveBeenCalledWith({
      algorithmId: 'saga:buffer',
      parameters: {},
      projectPath: undefined,
      timeoutMs: 5000,
      importPreference: undefined,
      expectedOutputs: undefined,
      chatId: 'chat-qgis'
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('DISALLOWED_PROVIDER')
      expect(result.error.message).toContain('not allowed')
      expect(result.error.details).toEqual({
        launcherPath: 'C:\\QGIS\\bin\\qgis_process-qgis.bat',
        workspacePath: 'C:\\workspace',
        outputDirectory: 'C:\\workspace\\outputs',
        discoveryDiagnostics: []
      })
    }
  })

  it('forwards qgis_list_algorithms filters to the QGIS process service', async () => {
    const qgisProcessService = {
      listAlgorithms: vi.fn(async () => ({
        success: true,
        operation: 'listAlgorithms',
        stdout: '{}',
        stderr: '',
        exitCode: 0,
        durationMs: 14,
        version: '3.40.1',
        artifacts: [],
        importedLayers: [],
        parsedResult: {
          algorithms: [
            {
              id: 'native:extractbyexpression',
              name: 'Extract by expression',
              provider: 'native',
              supportedForExecution: true
            }
          ],
          totalAlgorithms: 100,
          matchedAlgorithms: 3,
          returnedAlgorithms: 1,
          truncated: true,
          filters: {
            query: 'extract',
            provider: 'native',
            limit: 1
          }
        },
        diagnostics: {
          launcherPath: 'C:\\QGIS\\bin\\qgis_process-qgis.bat',
          workspacePath: 'C:\\workspace',
          outputDirectory: 'C:\\workspace\\outputs',
          discoveryDiagnostics: []
        }
      })),
      describeAlgorithm: vi.fn(),
      runAlgorithm: vi.fn(),
      applyLayerStyle: vi.fn(),
      exportLayout: vi.fn()
    }

    const adapter = new NativeConnectorAdapter(
      {
        getConfig: vi.fn(async () => ({ detectionMode: 'auto' }))
      } as never,
      {
        getConnectionInfo: vi.fn(async () => ({ connected: true, config: {} })),
        executeQuery: vi.fn()
      } as never,
      qgisProcessService as never
    )

    const result = await adapter.execute(
      {
        integrationId: 'qgis',
        capability: 'desktop.processing.listAlgorithms',
        input: {
          query: 'extract',
          provider: 'native',
          limit: '1'
        }
      },
      {
        timeoutMs: 5000,
        attempt: 0,
        maxRetries: 0
      }
    )

    expect(qgisProcessService.listAlgorithms).toHaveBeenCalledWith({
      query: 'extract',
      provider: 'native',
      limit: 1,
      timeoutMs: 5000
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({
        operation: 'listAlgorithms',
        exitCode: 0,
        version: '3.40.1',
        artifacts: [],
        importedLayers: [],
        result: {
          algorithms: [
            {
              id: 'native:extractbyexpression',
              name: 'Extract by expression',
              provider: 'native',
              supportedForExecution: true
            }
          ],
          totalAlgorithms: 100,
          matchedAlgorithms: 3,
          returnedAlgorithms: 1,
          truncated: true,
          filters: {
            query: 'extract',
            provider: 'native',
            limit: 1
          }
        }
      })
    }
  })

  it('returns imported QGIS layer metadata for successful runs', async () => {
    const qgisProcessService = {
      listAlgorithms: vi.fn(),
      describeAlgorithm: vi.fn(),
      runAlgorithm: vi.fn(async () => ({
        success: true,
        operation: 'runAlgorithm',
        stdout: '{}',
        stderr: '',
        exitCode: 0,
        durationMs: 32,
        version: '3.40.1',
        artifacts: [
          {
            path: 'E:\\outputs\\buffer.geojson',
            kind: 'vector',
            exists: true,
            imported: true
          }
        ],
        importedLayers: [
          {
            path: 'E:\\outputs\\buffer.geojson',
            layer: {
              name: 'buffer-output',
              type: 'vector',
              sourceId: 'source-buffer-output',
              sourceConfig: {
                type: 'geojson',
                data: {
                  type: 'FeatureCollection',
                  features: []
                }
              },
              style: {},
              visibility: true,
              opacity: 1,
              zIndex: 0,
              metadata: {
                tags: ['qgis'],
                featureCount: 42,
                geometryType: 'Polygon'
              },
              isLocked: false,
              createdBy: 'import'
            }
          }
        ],
        parsedResult: {
          algorithmId: 'native:buffer'
        },
        diagnostics: {
          launcherPath: 'C:\\QGIS\\bin\\qgis_process-qgis.bat',
          workspacePath: 'C:\\workspace',
          outputDirectory: 'C:\\workspace\\outputs',
          discoveryDiagnostics: []
        }
      })),
      applyLayerStyle: vi.fn(),
      exportLayout: vi.fn()
    }

    const adapter = new NativeConnectorAdapter(
      {
        getConfig: vi.fn(async () => ({ detectionMode: 'auto' }))
      } as never,
      {
        getConnectionInfo: vi.fn(async () => ({ connected: true, config: {} })),
        executeQuery: vi.fn()
      } as never,
      qgisProcessService as never
    )

    const result = await adapter.execute(
      {
        integrationId: 'qgis',
        capability: 'desktop.processing.run',
        chatId: 'chat-qgis',
        input: {
          algorithmId: 'native:buffer'
        }
      },
      {
        timeoutMs: 5000,
        attempt: 0,
        maxRetries: 0
      }
    )

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({
        operation: 'runAlgorithm',
        exitCode: 0,
        version: '3.40.1',
        artifacts: [
          {
            path: 'E:\\outputs\\buffer.geojson',
            kind: 'vector',
            exists: true,
            imported: true
          }
        ],
        importedLayers: [
          {
            path: 'E:\\outputs\\buffer.geojson',
            layerName: 'buffer-output',
            layerType: 'vector'
          }
        ],
        result: {
          algorithmId: 'native:buffer'
        }
      })
    }
  })
})
