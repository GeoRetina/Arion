import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { runQgisLauncherCommand } = vi.hoisted(() => ({
  runQgisLauncherCommand: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => path.join(os.tmpdir(), 'arion-test-user-data'))
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}))

vi.mock('./qgis-command-runner', () => ({
  runQgisLauncherCommand
}))

import type { LayerCreateInput } from '../../../shared/types/layer-types'
import { QgisProcessService } from './qgis-process-service'
import type { QgisDiscoveryResult } from './types'

function createDiscoveredInstallation(): QgisDiscoveryResult {
  return {
    status: 'found' as const,
    preferredInstallation: {
      launcherPath: 'C:\\QGIS\\bin\\qgis_process-qgis.bat',
      installRoot: 'C:\\QGIS',
      version: '3.40.1',
      platform: process.platform,
      source: 'manual' as const,
      diagnostics: []
    },
    installations: [],
    diagnostics: []
  }
}

describe('QgisProcessService', () => {
  let tempRoot: string

  beforeEach(async () => {
    runQgisLauncherCommand.mockReset()
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'arion-qgis-process-'))
  })

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true })
  })

  it('rejects disallowed providers before spawning QGIS', async () => {
    const service = new QgisProcessService({
      connectorHubService: {
        getConfig: vi.fn(async () => ({
          detectionMode: 'auto',
          allowPluginAlgorithms: false
        }))
      } as never,
      getUserDataPath: () => tempRoot
    })

    const result = await service.runAlgorithm({
      algorithmId: 'saga:buffer'
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorCode).toBe('DISALLOWED_PROVIDER')
    }
    expect(runQgisLauncherCommand).not.toHaveBeenCalled()
  })

  it('rejects output paths outside the managed workspace', async () => {
    const inputPath = path.join(tempRoot, 'input.geojson')
    await fs.writeFile(
      inputPath,
      JSON.stringify({
        type: 'FeatureCollection',
        features: []
      }),
      'utf8'
    )

    const service = new QgisProcessService({
      connectorHubService: {
        getConfig: vi.fn(async () => ({
          detectionMode: 'auto'
        }))
      } as never,
      getUserDataPath: () => tempRoot
    })

    const result = await service.runAlgorithm({
      algorithmId: 'native:buffer',
      parameters: {
        INPUT: inputPath,
        OUTPUT: path.join(tempRoot, '..', 'outside.geojson')
      }
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorCode).toBe('VALIDATION_FAILED')
      expect(result.message).toContain('managed QGIS output workspace')
    }
    expect(runQgisLauncherCommand).not.toHaveBeenCalled()
  })

  it('filters listed algorithms by query, provider, and limit', async () => {
    runQgisLauncherCommand.mockResolvedValue({
      stdout: JSON.stringify({
        algorithms: [
          {
            id: 'native:extractbyexpression',
            display_name: 'Extract by expression'
          },
          {
            id: 'native:extractbyattribute',
            display_name: 'Extract by attribute',
            provider: 'native'
          },
          {
            id: 'native:buffer',
            display_name: 'Buffer',
            provider: 'native'
          },
          {
            id: 'gdal:translate',
            display_name: 'Convert format',
            provider: 'gdal'
          }
        ]
      }),
      stderr: '',
      exitCode: 0,
      durationMs: 12
    })

    const service = new QgisProcessService({
      connectorHubService: {
        getConfig: vi.fn(async () => ({
          detectionMode: 'auto'
        }))
      } as never,
      algorithmCatalogService: {
        rankAlgorithms: vi.fn(async () => null),
        warmCatalog: vi.fn()
      } as never,
      discoveryService: {
        discover: vi.fn(async () => createDiscoveredInstallation())
      } as never,
      getUserDataPath: () => tempRoot
    })

    const result = await service.listAlgorithms({
      query: 'extract',
      provider: 'native',
      limit: 1
    })

    expect(runQgisLauncherCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        launcherPath: 'C:\\QGIS\\bin\\qgis_process-qgis.bat',
        args: ['--json', '--skip-loading-plugins', 'list']
      })
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.parsedResult).toEqual({
        algorithms: [
          {
            id: 'native:extractbyattribute',
            name: 'Extract by attribute',
            provider: 'native',
            supportedForExecution: true
          }
        ],
        totalAlgorithms: 4,
        matchedAlgorithms: 2,
        returnedAlgorithms: 1,
        truncated: true,
        filters: {
          query: 'extract',
          provider: 'native',
          limit: 1
        }
      })
    }
  })

  it('parses provider-scoped QGIS list output from QGIS 3.36+', async () => {
    runQgisLauncherCommand.mockResolvedValue({
      stdout: JSON.stringify({
        providers: {
          native: {
            algorithms: {
              'native:extractbyexpression': {
                name: 'Extract by expression'
              },
              'native:extractbyattribute': {
                name: 'Extract by attribute'
              },
              'native:buffer': {
                name: 'Buffer'
              }
            }
          },
          gdal: {
            algorithms: {
              'gdal:translate': {
                name: 'Convert format'
              }
            }
          }
        }
      }),
      stderr: '',
      exitCode: 0,
      durationMs: 12
    })

    const service = new QgisProcessService({
      connectorHubService: {
        getConfig: vi.fn(async () => ({
          detectionMode: 'auto'
        }))
      } as never,
      algorithmCatalogService: {
        rankAlgorithms: vi.fn(async () => null),
        warmCatalog: vi.fn()
      } as never,
      discoveryService: {
        discover: vi.fn(async () => createDiscoveredInstallation())
      } as never,
      getUserDataPath: () => tempRoot
    })

    const result = await service.listAlgorithms({
      query: 'extract',
      provider: 'native',
      limit: 2
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.parsedResult).toEqual({
        algorithms: [
          {
            id: 'native:extractbyattribute',
            name: 'Extract by attribute',
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
        totalAlgorithms: 4,
        matchedAlgorithms: 2,
        returnedAlgorithms: 2,
        truncated: false,
        filters: {
          query: 'extract',
          provider: 'native',
          limit: 2
        }
      })
    }
  })

  it('uses the algorithm catalog to rank listed algorithms when available', async () => {
    runQgisLauncherCommand.mockResolvedValue({
      stdout: JSON.stringify({
        algorithms: [
          {
            id: 'native:orderbyexpression',
            display_name: 'Order by expression',
            provider: 'native'
          },
          {
            id: 'native:extractbyexpression',
            display_name: 'Extract by expression',
            provider: 'native'
          }
        ]
      }),
      stderr: '',
      exitCode: 0,
      durationMs: 11
    })

    const rankAlgorithms = vi.fn(async () => ({
      algorithms: [
        {
          id: 'native:orderbyexpression',
          name: 'Order by expression',
          provider: 'native',
          supportedForExecution: true,
          summary: 'Sorts features by an expression.',
          parameterNames: ['INPUT', 'EXPRESSION', 'ASCENDING', 'OUTPUT']
        }
      ],
      totalAlgorithms: 2,
      matchedAlgorithms: 1,
      returnedAlgorithms: 1,
      truncated: false
    }))

    const service = new QgisProcessService({
      connectorHubService: {
        getConfig: vi.fn(async () => ({
          detectionMode: 'auto',
          allowPluginAlgorithms: false
        }))
      } as never,
      algorithmCatalogService: {
        rankAlgorithms,
        warmCatalog: vi.fn()
      } as never,
      discoveryService: {
        discover: vi.fn(async () => createDiscoveredInstallation())
      } as never,
      getUserDataPath: () => tempRoot
    })

    const result = await service.listAlgorithms({
      query: 'sort line features by length descending',
      provider: 'native',
      limit: 5
    })

    expect(rankAlgorithms).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'sort line features by length descending',
        provider: 'native',
        limit: 5,
        launcherPath: 'C:\\QGIS\\bin\\qgis_process-qgis.bat',
        allowPluginAlgorithms: false
      })
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.parsedResult).toEqual({
        algorithms: [
          {
            id: 'native:orderbyexpression',
            name: 'Order by expression',
            provider: 'native',
            supportedForExecution: true,
            summary: 'Sorts features by an expression.',
            parameterNames: ['INPUT', 'EXPRESSION', 'ASCENDING', 'OUTPUT']
          }
        ],
        totalAlgorithms: 2,
        matchedAlgorithms: 1,
        returnedAlgorithms: 1,
        truncated: false
      })
    }
  })

  it('imports supported output artifacts and broadcasts them when auto import is enabled', async () => {
    const inputPath = path.join(tempRoot, 'input.geojson')
    await fs.writeFile(
      inputPath,
      JSON.stringify({
        type: 'FeatureCollection',
        features: []
      }),
      'utf8'
    )

    const importedLayer: LayerCreateInput = {
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
        featureCount: 5,
        geometryType: 'Polygon',
        bounds: [-79.4, 43.6, -79.2, 43.8],
        attributes: {
          id: {
            type: 'number',
            nullable: false
          }
        }
      },
      isLocked: false,
      createdBy: 'import'
    }

    const broadcastLayerImports = vi.fn()
    const localLayerImportService = {
      importPath: vi.fn(async () => importedLayer)
    }

    runQgisLauncherCommand.mockImplementation(
      async ({ stdin, cwd }: { stdin?: string; cwd?: string }) => {
        const payload = JSON.parse(stdin || '{}') as {
          inputs?: { OUTPUT?: string }
        }
        const outputPath = payload.inputs?.OUTPUT
        if (!outputPath) {
          throw new Error('Missing output path in mocked QGIS request')
        }

        expect(cwd).toContain('run-')
        expect(outputPath).toContain(path.join(cwd || '', 'outputs'))

        await fs.writeFile(
          outputPath,
          JSON.stringify({
            type: 'FeatureCollection',
            features: []
          }),
          'utf8'
        )

        return {
          stdout: JSON.stringify({
            results: {
              OUTPUT: outputPath
            }
          }),
          stderr: '',
          exitCode: 0,
          durationMs: 25
        }
      }
    )

    const service = new QgisProcessService({
      connectorHubService: {
        getConfig: vi.fn(async () => ({
          detectionMode: 'auto'
        }))
      } as never,
      discoveryService: {
        discover: vi.fn(async () => createDiscoveredInstallation())
      } as never,
      localLayerImportService: localLayerImportService as never,
      getUserDataPath: () => tempRoot,
      broadcastLayerImports
    })

    const result = await service.runAlgorithm({
      algorithmId: 'native:buffer',
      parameters: {
        INPUT: inputPath,
        OUTPUT: 'buffer.geojson'
      },
      importPreference: 'auto',
      chatId: 'chat-qgis'
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.workflowId).toEqual(expect.any(String))
      expect(result.diagnostics.workflowId).toBe(result.workflowId)
      expect(result.artifacts).toHaveLength(1)
      expect(result.artifacts[0]).toMatchObject({
        workflowId: result.workflowId,
        artifactId: 'buffer',
        relativePath: 'buffer.geojson',
        kind: 'vector',
        exists: true,
        selectedForImport: true,
        imported: true
      })
      expect(result.importedLayers).toEqual([
        {
          path: result.artifacts[0].path,
          layer: importedLayer
        }
      ])
      expect(result.outputs).toEqual([
        expect.objectContaining({
          path: result.artifacts[0].path,
          workflowId: result.workflowId,
          artifactId: 'buffer',
          relativePath: 'buffer.geojson',
          kind: 'vector',
          exists: true,
          selectedForImport: true,
          imported: true,
          layer: {
            name: 'buffer-output',
            type: 'vector',
            sourceType: 'geojson',
            sourceId: 'source-buffer-output',
            metadata: {
              tags: ['qgis'],
              featureCount: 5,
              geometryType: 'Polygon',
              bounds: [-79.4, 43.6, -79.2, 43.8],
              attributeKeys: ['id']
            }
          }
        })
      ])
    }

    expect(localLayerImportService.importPath).toHaveBeenCalledTimes(1)
    expect(broadcastLayerImports).toHaveBeenCalledWith({
      chatId: 'chat-qgis',
      source: 'qgis',
      runId: expect.any(String),
      layers: [importedLayer]
    })
  })

  it('imports supported output artifacts by default when importPreference is omitted', async () => {
    const inputPath = path.join(tempRoot, 'input.geojson')
    await fs.writeFile(
      inputPath,
      JSON.stringify({
        type: 'FeatureCollection',
        features: []
      }),
      'utf8'
    )

    const importedLayer: LayerCreateInput = {
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
        featureCount: 7,
        geometryType: 'Polygon'
      },
      isLocked: false,
      createdBy: 'import'
    }

    const broadcastLayerImports = vi.fn()
    const localLayerImportService = {
      importPath: vi.fn(async () => importedLayer)
    }

    runQgisLauncherCommand.mockImplementation(async ({ stdin }: { stdin?: string }) => {
      const payload = JSON.parse(stdin || '{}') as {
        inputs?: { OUTPUT?: string }
      }
      const outputPath = payload.inputs?.OUTPUT
      if (!outputPath) {
        throw new Error('Missing output path in mocked QGIS request')
      }

      await fs.writeFile(
        outputPath,
        JSON.stringify({
          type: 'FeatureCollection',
          features: []
        }),
        'utf8'
      )

      return {
        stdout: JSON.stringify({
          results: {
            OUTPUT: outputPath
          }
        }),
        stderr: '',
        exitCode: 0,
        durationMs: 25
      }
    })

    const service = new QgisProcessService({
      connectorHubService: {
        getConfig: vi.fn(async () => ({
          detectionMode: 'auto'
        }))
      } as never,
      discoveryService: {
        discover: vi.fn(async () => createDiscoveredInstallation())
      } as never,
      localLayerImportService: localLayerImportService as never,
      getUserDataPath: () => tempRoot,
      broadcastLayerImports
    })

    const result = await service.runAlgorithm({
      algorithmId: 'native:buffer',
      parameters: {
        INPUT: inputPath,
        OUTPUT: 'buffer-default.geojson'
      },
      chatId: 'chat-qgis'
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.workflowId).toEqual(expect.any(String))
      expect(result.diagnostics.workflowId).toBe(result.workflowId)
      expect(result.artifacts).toHaveLength(1)
      expect(result.artifacts[0]).toMatchObject({
        workflowId: result.workflowId,
        artifactId: 'buffer_default',
        relativePath: 'buffer-default.geojson',
        kind: 'vector',
        exists: true,
        selectedForImport: true,
        imported: true
      })
      expect(result.importedLayers).toEqual([
        {
          path: result.artifacts[0].path,
          layer: importedLayer
        }
      ])
      expect(result.outputs).toEqual([
        expect.objectContaining({
          path: result.artifacts[0].path,
          workflowId: result.workflowId,
          artifactId: 'buffer_default',
          relativePath: 'buffer-default.geojson',
          kind: 'vector',
          exists: true,
          selectedForImport: true,
          imported: true,
          layer: {
            name: 'buffer-output',
            type: 'vector',
            sourceType: 'geojson',
            sourceId: 'source-buffer-output',
            metadata: {
              tags: ['qgis'],
              featureCount: 7,
              geometryType: 'Polygon'
            }
          }
        })
      ])
    }

    expect(localLayerImportService.importPath).toHaveBeenCalledTimes(1)
    expect(broadcastLayerImports).toHaveBeenCalledWith({
      chatId: 'chat-qgis',
      source: 'qgis',
      runId: expect.any(String),
      layers: [importedLayer]
    })
  })

  it('inspects supported output artifacts when importPreference is suggest', async () => {
    const inputPath = path.join(tempRoot, 'input.geojson')
    await fs.writeFile(
      inputPath,
      JSON.stringify({
        type: 'FeatureCollection',
        features: []
      }),
      'utf8'
    )

    runQgisLauncherCommand.mockImplementation(async ({ stdin }: { stdin?: string }) => {
      const payload = JSON.parse(stdin || '{}') as {
        inputs?: { OUTPUT?: string }
      }
      const outputPath = payload.inputs?.OUTPUT
      if (!outputPath) {
        throw new Error('Missing output path in mocked QGIS request')
      }

      await fs.writeFile(
        outputPath,
        JSON.stringify({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [-79.38, 43.65]
              },
              properties: {
                id: 1,
                name: 'Downtown'
              }
            }
          ]
        }),
        'utf8'
      )

      return {
        stdout: JSON.stringify({
          results: {
            OUTPUT: outputPath
          }
        }),
        stderr: '',
        exitCode: 0,
        durationMs: 18
      }
    })

    const localLayerImportService = {
      importPath: vi.fn()
    }

    const service = new QgisProcessService({
      connectorHubService: {
        getConfig: vi.fn(async () => ({
          detectionMode: 'auto'
        }))
      } as never,
      discoveryService: {
        discover: vi.fn(async () => createDiscoveredInstallation())
      } as never,
      localLayerImportService: localLayerImportService as never,
      getUserDataPath: () => tempRoot
    })

    const result = await service.runAlgorithm({
      algorithmId: 'native:extractbyexpression',
      parameters: {
        INPUT: inputPath,
        OUTPUT: 'suggest-output.geojson'
      },
      importPreference: 'suggest'
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.workflowId).toEqual(expect.any(String))
      expect(result.diagnostics.workflowId).toBe(result.workflowId)
      expect(result.importedLayers).toEqual([])
      expect(result.outputs).toEqual([
        expect.objectContaining({
          path: result.artifacts[0].path,
          workflowId: result.workflowId,
          artifactId: 'suggest_output',
          relativePath: 'suggest-output.geojson',
          kind: 'vector',
          exists: true,
          selectedForImport: false,
          imported: false,
          layer: {
            name: 'suggest-output',
            type: 'vector',
            sourceType: 'geojson',
            metadata: {
              description: 'Imported GeoJSON file with 1 features',
              tags: ['imported', 'geojson'],
              geometryType: 'Point',
              featureCount: 1,
              bounds: [-79.38, 43.65, -79.38, 43.65],
              crs: 'EPSG:4326',
              attributeKeys: ['id', 'name']
            }
          }
        })
      ])
    }

    expect(localLayerImportService.importPath).not.toHaveBeenCalled()
  })

  it('imports only explicitly selected outputs when outputsToImport is provided', async () => {
    const inputPath = path.join(tempRoot, 'input.geojson')
    await fs.writeFile(
      inputPath,
      JSON.stringify({
        type: 'FeatureCollection',
        features: []
      }),
      'utf8'
    )

    const importedLayerByPath = new Map<string, LayerCreateInput>()
    const broadcastLayerImports = vi.fn()
    let expectedTop10Path: string | undefined
    let expectedRemainderPath: string | undefined
    const localLayerImportService = {
      importPath: vi.fn(async (artifactPath: string) => {
        const layer = importedLayerByPath.get(artifactPath)
        if (!layer) {
          throw new Error(`Unexpected import path: ${artifactPath}`)
        }
        return layer
      })
    }

    runQgisLauncherCommand.mockImplementation(async ({ stdin }: { stdin?: string }) => {
      const payload = JSON.parse(stdin || '{}') as {
        inputs?: { TOP10_OUTPUT?: string; REMAINDER_OUTPUT?: string }
      }
      const top10Path = payload.inputs?.TOP10_OUTPUT
      const remainderPath = payload.inputs?.REMAINDER_OUTPUT
      if (!top10Path || !remainderPath) {
        throw new Error('Missing output paths in mocked QGIS request')
      }

      importedLayerByPath.set(top10Path, {
        name: 'top_10_longest_features',
        type: 'vector',
        sourceId: 'source-top-10',
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
          featureCount: 10,
          geometryType: 'LineString'
        },
        isLocked: false,
        createdBy: 'import'
      })

      await fs.writeFile(
        top10Path,
        JSON.stringify({
          type: 'FeatureCollection',
          features: Array.from({ length: 10 }, (_, index) => ({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [-79.4 + index * 0.001, 43.6],
                [-79.39 + index * 0.001, 43.61]
              ]
            },
            properties: {
              rank: index + 1
            }
          }))
        }),
        'utf8'
      )

      await fs.writeFile(
        remainderPath,
        JSON.stringify({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: [
                  [-79.5, 43.7],
                  [-79.49, 43.71]
                ]
              },
              properties: {
                kind: 'remainder'
              }
            }
          ]
        }),
        'utf8'
      )

      return {
        stdout: JSON.stringify({
          results: {
            TOP10_OUTPUT: top10Path,
            REMAINDER_OUTPUT: remainderPath
          }
        }),
        stderr: '',
        exitCode: 0,
        durationMs: 21
      }
    })

    const service = new QgisProcessService({
      connectorHubService: {
        getConfig: vi.fn(async () => ({
          detectionMode: 'auto'
        }))
      } as never,
      discoveryService: {
        discover: vi.fn(async () => createDiscoveredInstallation())
      } as never,
      localLayerImportService: localLayerImportService as never,
      getUserDataPath: () => tempRoot,
      broadcastLayerImports
    })

    const result = await service.runAlgorithm({
      algorithmId: 'native:extractbyexpression',
      parameters: {
        INPUT: inputPath,
        TOP10_OUTPUT: 'top_10_longest_features.geojson',
        REMAINDER_OUTPUT: 'non_top10_features.geojson'
      },
      importPreference: 'auto',
      outputsToImport: ['top_10_longest_features.geojson'],
      chatId: 'chat-qgis'
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.workflowId).toEqual(expect.any(String))
      expect(result.diagnostics.workflowId).toBe(result.workflowId)
      expectedTop10Path = path.join(
        result.diagnostics.outputDirectory,
        'top_10_longest_features.geojson'
      )
      expectedRemainderPath = path.join(
        result.diagnostics.outputDirectory,
        'non_top10_features.geojson'
      )

      expect(result.artifacts).toHaveLength(2)
      expect(result.artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: expectedTop10Path,
            workflowId: result.workflowId,
            artifactId: 'top_10_longest_features',
            relativePath: 'top_10_longest_features.geojson',
            kind: 'vector',
            exists: true,
            selectedForImport: true,
            imported: true
          }),
          expect.objectContaining({
            path: expectedRemainderPath,
            workflowId: result.workflowId,
            artifactId: 'non_top10_features',
            relativePath: 'non_top10_features.geojson',
            kind: 'vector',
            exists: true,
            selectedForImport: false
          })
        ])
      )
      expect(result.importedLayers).toEqual([
        {
          path: expectedTop10Path,
          layer: importedLayerByPath.get(expectedTop10Path) as LayerCreateInput
        }
      ])
      expect(result.outputs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: expectedTop10Path,
            workflowId: result.workflowId,
            artifactId: 'top_10_longest_features',
            relativePath: 'top_10_longest_features.geojson',
            selectedForImport: true,
            imported: true,
            layer: expect.objectContaining({
              name: 'top_10_longest_features',
              sourceId: 'source-top-10',
              metadata: expect.objectContaining({
                featureCount: 10,
                geometryType: 'LineString'
              })
            })
          }),
          expect.objectContaining({
            path: expectedRemainderPath,
            workflowId: result.workflowId,
            artifactId: 'non_top10_features',
            relativePath: 'non_top10_features.geojson',
            selectedForImport: false,
            imported: false,
            layer: expect.objectContaining({
              name: 'non_top10_features',
              metadata: expect.objectContaining({
                featureCount: 1,
                geometryType: 'LineString'
              })
            })
          })
        ])
      )
    }

    expect(expectedTop10Path).toBeDefined()
    expect(localLayerImportService.importPath).toHaveBeenCalledTimes(1)
    expect(localLayerImportService.importPath).toHaveBeenCalledWith(expectedTop10Path)
    expect(broadcastLayerImports).toHaveBeenCalledWith({
      chatId: 'chat-qgis',
      source: 'qgis',
      runId: expect.any(String),
      layers: [importedLayerByPath.get(expectedTop10Path as string) as LayerCreateInput]
    })
  })

  it('reuses workflow workspaces and artifact handles across QGIS runs', async () => {
    const inputPath = path.join(tempRoot, 'input.geojson')
    await fs.writeFile(
      inputPath,
      JSON.stringify({
        type: 'FeatureCollection',
        features: []
      }),
      'utf8'
    )

    let invocationCount = 0
    let firstCwd: string | undefined
    let sortedOutputPath: string | undefined

    runQgisLauncherCommand.mockImplementation(
      async ({ stdin, cwd }: { stdin?: string; cwd?: string }) => {
        invocationCount += 1
        const payload = JSON.parse(stdin || '{}') as {
          inputs?: { INPUT?: string; OUTPUT?: string }
        }
        const outputPath = payload.inputs?.OUTPUT
        if (!outputPath) {
          throw new Error('Missing output path in mocked QGIS request')
        }

        await fs.writeFile(
          outputPath,
          JSON.stringify({
            type: 'FeatureCollection',
            features: []
          }),
          'utf8'
        )

        if (invocationCount === 1) {
          firstCwd = cwd
          sortedOutputPath = outputPath
          expect(payload.inputs?.INPUT).toBe(inputPath)
        } else if (invocationCount === 2) {
          expect(cwd).toBe(firstCwd)
          expect(payload.inputs?.INPUT).toBe(sortedOutputPath)
          expect(outputPath).toContain(path.join(firstCwd || '', 'outputs'))
        } else {
          throw new Error(`Unexpected invocation count: ${invocationCount}`)
        }

        return {
          stdout: JSON.stringify({
            results: {
              OUTPUT: outputPath
            }
          }),
          stderr: '',
          exitCode: 0,
          durationMs: 16
        }
      }
    )

    const service = new QgisProcessService({
      connectorHubService: {
        getConfig: vi.fn(async () => ({
          detectionMode: 'auto'
        }))
      } as never,
      discoveryService: {
        discover: vi.fn(async () => createDiscoveredInstallation())
      } as never,
      getUserDataPath: () => tempRoot
    })

    const firstResult = await service.runAlgorithm({
      algorithmId: 'native:orderbyexpression',
      parameters: {
        INPUT: inputPath,
        OUTPUT: 'sorted_lines.geojson'
      },
      importPreference: 'suggest',
      chatId: 'chat-qgis'
    })

    expect(firstResult.success).toBe(true)
    if (!firstResult.success) {
      return
    }

    expect(firstResult.workflowId).toEqual(expect.any(String))
    expect(firstResult.artifacts).toEqual([
      expect.objectContaining({
        workflowId: firstResult.workflowId,
        artifactId: 'sorted_lines',
        relativePath: 'sorted_lines.geojson'
      })
    ])

    const secondResult = await service.runAlgorithm({
      algorithmId: 'native:extractbyexpression',
      workflowId: firstResult.workflowId,
      parameters: {
        INPUT: `artifact:${firstResult.artifacts[0]?.artifactId}`,
        OUTPUT: 'top_10_longest_features.geojson'
      },
      importPreference: 'suggest',
      chatId: 'chat-qgis'
    })

    expect(secondResult.success).toBe(true)
    if (secondResult.success) {
      expect(secondResult.workflowId).toBe(firstResult.workflowId)
      expect(secondResult.diagnostics.workflowId).toBe(firstResult.workflowId)
      expect(secondResult.diagnostics.outputDirectory).toBe(firstResult.diagnostics.outputDirectory)
      expect(secondResult.artifacts).toEqual([
        expect.objectContaining({
          workflowId: firstResult.workflowId,
          artifactId: 'top_10_longest_features',
          relativePath: 'top_10_longest_features.geojson'
        })
      ])
      expect(secondResult.outputs).toEqual([
        expect.objectContaining({
          workflowId: firstResult.workflowId,
          artifactId: 'top_10_longest_features',
          relativePath: 'top_10_longest_features.geojson'
        })
      ])
    }

    expect(invocationCount).toBe(2)
  })

  it('rejects outputsToImport paths outside the managed workspace', async () => {
    const inputPath = path.join(tempRoot, 'input.geojson')
    await fs.writeFile(
      inputPath,
      JSON.stringify({
        type: 'FeatureCollection',
        features: []
      }),
      'utf8'
    )

    const service = new QgisProcessService({
      connectorHubService: {
        getConfig: vi.fn(async () => ({
          detectionMode: 'auto'
        }))
      } as never,
      getUserDataPath: () => tempRoot
    })

    const result = await service.runAlgorithm({
      algorithmId: 'native:buffer',
      parameters: {
        INPUT: inputPath,
        OUTPUT: 'buffer.geojson'
      },
      outputsToImport: ['..\\outside.geojson']
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorCode).toBe('VALIDATION_FAILED')
      expect(result.message).toContain('managed QGIS output workspace')
    }
    expect(runQgisLauncherCommand).not.toHaveBeenCalled()
  })

  it('accepts artifact references with a single leading slash', async () => {
    const inputPath = path.join(tempRoot, 'input.geojson')
    await fs.writeFile(
      inputPath,
      JSON.stringify({
        type: 'FeatureCollection',
        features: []
      }),
      'utf8'
    )

    let firstOutputPath: string | null = null
    let invocationCount = 0
    runQgisLauncherCommand.mockImplementation(async ({ stdin, cwd }) => {
      invocationCount += 1
      const payload = JSON.parse(stdin || '{}')
      const outputPath = payload.inputs?.OUTPUT as string

      await fs.writeFile(
        outputPath,
        JSON.stringify({
          type: 'FeatureCollection',
          features: []
        }),
        'utf8'
      )

      if (invocationCount === 1) {
        firstOutputPath = outputPath
      } else if (invocationCount === 2) {
        expect(payload.inputs?.INPUT).toBe(firstOutputPath)
        expect(cwd).toContain(path.join('chat-qgis'))
      }

      return {
        stdout: JSON.stringify({
          results: {
            OUTPUT: outputPath
          }
        }),
        stderr: '',
        exitCode: 0,
        durationMs: 12
      }
    })

    const service = new QgisProcessService({
      connectorHubService: {
        getConfig: vi.fn(async () => ({
          detectionMode: 'auto'
        }))
      } as never,
      discoveryService: {
        discover: vi.fn(async () => createDiscoveredInstallation())
      } as never,
      getUserDataPath: () => tempRoot
    })

    const firstResult = await service.runAlgorithm({
      algorithmId: 'native:orderbyexpression',
      parameters: {
        INPUT: inputPath,
        OUTPUT: 'sorted_lines.geojson'
      },
      importPreference: 'suggest',
      chatId: 'chat-qgis'
    })

    expect(firstResult.success).toBe(true)
    if (!firstResult.success) {
      return
    }

    const artifactId = firstResult.artifacts[0]?.artifactId
    expect(artifactId).toBe('sorted_lines')

    const secondResult = await service.runAlgorithm({
      algorithmId: 'native:extractbyexpression',
      workflowId: firstResult.workflowId,
      parameters: {
        INPUT: `artifact:/${artifactId}`,
        OUTPUT: 'single-slash-reference.geojson'
      },
      importPreference: 'suggest',
      chatId: 'chat-qgis'
    })

    expect(secondResult.success).toBe(true)
    expect(invocationCount).toBe(2)
  })

  it('clears QGIS workflows when a chat is deleted', async () => {
    const inputPath = path.join(tempRoot, 'input.geojson')
    await fs.writeFile(
      inputPath,
      JSON.stringify({
        type: 'FeatureCollection',
        features: []
      }),
      'utf8'
    )

    runQgisLauncherCommand.mockImplementation(async ({ stdin }) => {
      const payload = JSON.parse(stdin || '{}')
      const outputPath = payload.inputs?.OUTPUT as string

      await fs.writeFile(
        outputPath,
        JSON.stringify({
          type: 'FeatureCollection',
          features: []
        }),
        'utf8'
      )

      return {
        stdout: JSON.stringify({
          results: {
            OUTPUT: outputPath
          }
        }),
        stderr: '',
        exitCode: 0,
        durationMs: 8
      }
    })

    const service = new QgisProcessService({
      connectorHubService: {
        getConfig: vi.fn(async () => ({
          detectionMode: 'auto'
        }))
      } as never,
      discoveryService: {
        discover: vi.fn(async () => createDiscoveredInstallation())
      } as never,
      getUserDataPath: () => tempRoot
    })

    const firstResult = await service.runAlgorithm({
      algorithmId: 'native:buffer',
      parameters: {
        INPUT: inputPath,
        OUTPUT: 'buffer.geojson'
      },
      importPreference: 'none',
      chatId: 'chat-cleanup'
    })

    expect(firstResult.success).toBe(true)
    if (!firstResult.success || !firstResult.workflowId) {
      return
    }

    service.clearWorkflowsForChat('chat-cleanup')

    const secondResult = await service.runAlgorithm({
      algorithmId: 'native:buffer',
      workflowId: firstResult.workflowId,
      parameters: {
        INPUT: inputPath,
        OUTPUT: 'buffer-again.geojson'
      },
      importPreference: 'none',
      chatId: 'chat-cleanup'
    })

    expect(secondResult.success).toBe(false)
    if (!secondResult.success) {
      expect(secondResult.errorCode).toBe('VALIDATION_FAILED')
      expect(secondResult.message).toContain('Unknown QGIS workflowId')
    }
  })
})
