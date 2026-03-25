import { createHash } from 'crypto'
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
import { QgisAlgorithmCatalogStore } from './qgis-algorithm-catalog-store'
import { createQgisSqliteDatabase } from './qgis-sqlite'

const CATALOG_DB_PATH = (rootPath: string): string =>
  path.join(rootPath, 'qgis-algorithm-catalogs', 'qgis-algorithm-catalogs.sqlite')

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
    expect(result?.algorithms[0]?.parameterNames).toEqual([
      'INPUT',
      'EXPRESSION',
      'ASCENDING',
      'OUTPUT'
    ])
    expect(result?.catalog?.enrichedEntries).toBeGreaterThan(0)

    const databasePath = CATALOG_DB_PATH(tempRoot)
    await expect(fs.stat(databasePath)).resolves.toBeTruthy()

    const db = createQgisSqliteDatabase(databasePath)
    try {
      const row = db
        .prepare(
          `SELECT help_fetched_at, parameter_names, parameter_types, parameter_descriptions
           FROM qgis_algorithm_entries
           WHERE id = ?`
        )
        .get('native:orderbyexpression') as {
        help_fetched_at: string | null
        parameter_names: string
        parameter_types: string
        parameter_descriptions: string
      }

      expect(row).toMatchObject({
        help_fetched_at: expect.any(String),
        parameter_names: JSON.stringify(['INPUT', 'EXPRESSION', 'ASCENDING', 'OUTPUT']),
        parameter_types: JSON.stringify(['boolean', 'expression', 'sink', 'vector']),
        parameter_descriptions: JSON.stringify([
          'Ascending order flag',
          'Expression used for ordering',
          'Input line layer',
          'Sorted output layer'
        ])
      })
    } finally {
      db.close()
    }
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

    const db = createQgisSqliteDatabase(CATALOG_DB_PATH(tempRoot))
    try {
      const rows = db.prepare('SELECT id FROM qgis_algorithm_entries ORDER BY id').all() as Array<{
        id: string
      }>

      expect(rows.map((entry) => entry.id)).toEqual(['native:buffer', 'native:extractbyexpression'])
    } finally {
      db.close()
    }
  })

  it('warms the base catalog from provider-scoped QGIS JSON output and rebuilds an empty catalog', async () => {
    const launcherPath = 'D:\\Program Files\\QGIS 3.36.2\\bin\\qgis_process-qgis.bat'
    const version = '3.36.2-Maidenhead'
    const cacheKey = createHash('sha1')
      .update(
        JSON.stringify({
          schemaVersion: 2,
          launcherPath,
          version,
          allowPluginAlgorithms: false
        })
      )
      .digest('hex')

    await fs.mkdir(path.dirname(CATALOG_DB_PATH(tempRoot)), { recursive: true })
    new QgisAlgorithmCatalogStore(CATALOG_DB_PATH(tempRoot)).readCatalog(cacheKey)

    const db = createQgisSqliteDatabase(CATALOG_DB_PATH(tempRoot))
    try {
      db.prepare(
        `INSERT INTO qgis_algorithm_catalogs (
           cache_key,
           launcher_path,
           version,
           allow_plugin_algorithms,
           built_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        cacheKey,
        launcherPath,
        version,
        0,
        '2026-03-25T22:26:11.980Z',
        '2026-03-25T22:26:11.980Z'
      )
    } finally {
      db.close()
    }

    runQgisLauncherCommand.mockResolvedValue({
      stdout: JSON.stringify({
        providers: {
          native: {
            algorithms: {
              'native:buffer': {
                name: 'Buffer'
              },
              'native:orderbyexpression': {
                name: 'Order by expression'
              }
            }
          }
        }
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
            launcherPath,
            installRoot: 'D:\\Program Files\\QGIS 3.36.2',
            version,
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

    const rebuiltDb = createQgisSqliteDatabase(CATALOG_DB_PATH(tempRoot))
    try {
      const rows = rebuiltDb
        .prepare('SELECT id FROM qgis_algorithm_entries ORDER BY id')
        .all() as Array<{
        id: string
      }>

      expect(rows.map((entry) => entry.id)).toEqual(['native:buffer', 'native:orderbyexpression'])
    } finally {
      rebuiltDb.close()
    }
  })
})
