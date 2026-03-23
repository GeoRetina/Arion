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

function createDiscoveredInstallation() {
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
        tags: ['qgis']
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
      expect(result.artifacts).toHaveLength(1)
      expect(result.artifacts[0]).toMatchObject({
        kind: 'vector',
        exists: true,
        imported: true
      })
      expect(result.importedLayers).toEqual([
        {
          path: result.artifacts[0].path,
          layer: importedLayer
        }
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
        tags: ['qgis']
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
      expect(result.artifacts).toHaveLength(1)
      expect(result.artifacts[0]).toMatchObject({
        kind: 'vector',
        exists: true,
        imported: true
      })
      expect(result.importedLayers).toEqual([
        {
          path: result.artifacts[0].path,
          layer: importedLayer
        }
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
})
