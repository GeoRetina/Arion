import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { runQgisLauncherCommand } = vi.hoisted(() => ({
  runQgisLauncherCommand: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => os.tmpdir())
  }
}))

vi.mock('./qgis-command-runner', () => ({
  runQgisLauncherCommand
}))

import { QgisAlgorithmCatalogService } from './qgis-algorithm-catalog-service'

describe('QgisAlgorithmCatalogService', () => {
  let tempRoot: string

  beforeEach(async () => {
    runQgisLauncherCommand.mockReset()
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'arion-qgis-catalog-'))
  })

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true })
  })

  it('ranks algorithms using cached help metadata from QGIS help output', async () => {
    runQgisLauncherCommand.mockImplementation(async ({ args }: { args: string[] }) => {
      const algorithmId = args[args.length - 1]
      if (algorithmId === 'native:orderbyexpression') {
        return {
          stdout: JSON.stringify({
            description:
              'Sorts features according to an expression and can return the result in ascending or descending order.',
            parameters: [
              { name: 'INPUT', type: 'vector', description: 'Input line layer', optional: false },
              {
                name: 'EXPRESSION',
                type: 'expression',
                description: 'Expression used for ordering',
                optional: false
              },
              { name: 'ASCENDING', type: 'boolean', description: 'Ascending order flag' },
              {
                name: 'OUTPUT',
                type: 'sink',
                description: 'Sorted output layer',
                optional: false
              }
            ]
          }),
          stderr: '',
          exitCode: 0,
          durationMs: 10
        }
      }

      if (algorithmId === 'native:extractbyexpression') {
        return {
          stdout: JSON.stringify({
            description: 'Extracts features from a layer using an expression filter.',
            parameters: [
              { name: 'INPUT', type: 'vector', description: 'Input layer', optional: false },
              {
                name: 'EXPRESSION',
                type: 'expression',
                description: 'Expression used to keep matching features',
                optional: false
              },
              {
                name: 'OUTPUT',
                type: 'sink',
                description: 'Filtered output layer',
                optional: false
              }
            ]
          }),
          stderr: '',
          exitCode: 0,
          durationMs: 10
        }
      }

      return {
        stdout: JSON.stringify({
          description: 'Creates buffer polygons around features.',
          parameters: [
            { name: 'INPUT', type: 'vector', description: 'Input layer', optional: false },
            { name: 'DISTANCE', type: 'number', description: 'Buffer distance', optional: false },
            {
              name: 'OUTPUT',
              type: 'sink',
              description: 'Buffered output layer',
              optional: false
            }
          ]
        }),
        stderr: '',
        exitCode: 0,
        durationMs: 10
      }
    })

    const service = new QgisAlgorithmCatalogService({
      getUserDataPath: () => tempRoot
    })

    const result = await service.rankAlgorithms({
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
        },
        {
          id: 'native:buffer',
          name: 'Buffer',
          provider: 'native',
          supportedForExecution: true
        }
      ],
      query: 'sort line features by length descending',
      limit: 3,
      launcherPath: 'C:\\QGIS\\bin\\qgis_process-qgis.bat',
      version: '3.40.1',
      allowPluginAlgorithms: false
    })

    expect(result).not.toBeNull()
    expect(result?.algorithms[0]).toMatchObject({
      id: 'native:orderbyexpression'
    })
    expect(result?.algorithms[0]?.summary).toContain('Sorts features according to an expression')
    expect(result?.algorithms[0]?.categoryHints).toContain('sorting')
    expect(result?.catalog?.enrichedEntries).toBeGreaterThan(0)

    const catalogDirectory = path.join(tempRoot, 'qgis-algorithm-catalogs')
    const cachedFiles = await fs.readdir(catalogDirectory)
    expect(cachedFiles).toHaveLength(1)

    const cachedCatalog = JSON.parse(
      await fs.readFile(path.join(catalogDirectory, cachedFiles[0]), 'utf8')
    ) as {
      entries: Array<{ id: string; helpFetchedAt?: string; parameterNames?: string[] }>
    }

    expect(
      cachedCatalog.entries.find((entry) => entry.id === 'native:orderbyexpression')
    ).toMatchObject({
      helpFetchedAt: expect.any(String),
      parameterNames: ['INPUT', 'EXPRESSION', 'ASCENDING', 'OUTPUT']
    })
  })

  it('warms the base catalog from the QGIS list output', async () => {
    runQgisLauncherCommand.mockResolvedValue({
      stdout: JSON.stringify({
        algorithms: [
          {
            id: 'native:buffer',
            display_name: 'Buffer',
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
      durationMs: 12
    })

    const service = new QgisAlgorithmCatalogService({
      discoveryService: {
        discover: vi.fn(async () => ({
          status: 'found',
          preferredInstallation: {
            launcherPath: 'C:\\QGIS\\bin\\qgis_process-qgis.bat',
            installRoot: 'C:\\QGIS',
            version: '3.40.1',
            platform: process.platform,
            source: 'manual',
            diagnostics: []
          },
          installations: [],
          diagnostics: []
        }))
      } as never,
      getUserDataPath: () => tempRoot
    })

    await service.warmCatalog({
      detectionMode: 'auto',
      allowPluginAlgorithms: false
    })

    const catalogDirectory = path.join(tempRoot, 'qgis-algorithm-catalogs')
    const cachedFiles = await fs.readdir(catalogDirectory)
    expect(cachedFiles).toHaveLength(1)

    const cachedCatalog = JSON.parse(
      await fs.readFile(path.join(catalogDirectory, cachedFiles[0]), 'utf8')
    ) as {
      entries: Array<{ id: string }>
    }

    expect(cachedCatalog.entries.map((entry) => entry.id)).toEqual([
      'native:buffer',
      'native:extractbyexpression'
    ])
  })
})
