import { promises as fs } from 'fs'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { type GdalRunnerService } from './gdal-runner-service'
import { RasterGdalTileService, type RasterGdalTileRenderRequest } from './raster-gdal-tile-service'

function createRequest(
  overrides: Partial<RasterGdalTileRenderRequest> = {}
): RasterGdalTileRenderRequest {
  return {
    assetId: 'asset-1',
    z: 3,
    x: 4,
    y: 2,
    bandCount: 3,
    bandRanges: [
      { min: 0, max: 255 },
      { min: 0, max: 255 },
      { min: 0, max: 255 }
    ],
    paletteIndexed: false,
    sourceByteLike: true,
    crs: 'EPSG:4326',
    mapBounds: [-90, 30, -45, 50],
    sourceFilePath: '/tmp/source.tif',
    transparentTilePng: Buffer.from([0]),
    ...overrides
  }
}

describe('raster-gdal-tile-service', () => {
  const cleanupPaths: string[] = []

  afterEach(async () => {
    while (cleanupPaths.length > 0) {
      const path = cleanupPaths.pop()
      if (!path) {
        continue
      }

      await fs.rm(path, { recursive: true, force: true })
    }
  })

  it('deduplicates concurrent renders for the same tile', async () => {
    const cacheRoot = mkdtempSync(join(tmpdir(), 'arion-gdal-tile-test-'))
    cleanupPaths.push(cacheRoot)
    let runCalls = 0
    let releaseGate!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve
    })

    const fakeRunner = {
      getAvailability: async () => ({
        available: true,
        runtimePaths: {
          binDirectory: '/mock/bin',
          gdalDataDirectory: '/mock/share/gdal',
          projDirectory: '/mock/share/proj',
          gdalPluginsDirectory: null
        }
      }),
      run: async (_tool: string, args: string[]) => {
        runCalls += 1
        await gate
        const outputPath = args[args.length - 1]
        await fs.mkdir(dirname(outputPath), { recursive: true })
        await fs.writeFile(outputPath, Buffer.from('tile-data'))
        return {
          command: 'gdalwarp',
          args,
          stdout: '',
          stderr: '',
          durationMs: 1
        }
      }
    } as unknown as GdalRunnerService

    const service = new RasterGdalTileService(fakeRunner, cacheRoot)
    const request = createRequest()

    const first = service.renderTile(request)
    const second = service.renderTile(request)

    releaseGate()
    const [a, b] = await Promise.all([first, second])
    expect(a?.toString()).toBe('tile-data')
    expect(b?.toString()).toBe('tile-data')
    expect(runCalls).toBe(1)
    service.shutdown()
  })

  it('does not persist rendered tiles to the on-disk cache', async () => {
    const cacheRoot = mkdtempSync(join(tmpdir(), 'arion-gdal-tile-test-'))
    cleanupPaths.push(cacheRoot)
    let runCalls = 0

    const fakeRunner = {
      getAvailability: async () => ({
        available: true,
        runtimePaths: {
          binDirectory: '/mock/bin',
          gdalDataDirectory: '/mock/share/gdal',
          projDirectory: '/mock/share/proj',
          gdalPluginsDirectory: null
        }
      }),
      run: async (_tool: string, args: string[]) => {
        runCalls += 1
        const outputPath = args[args.length - 1]
        await fs.mkdir(dirname(outputPath), { recursive: true })
        await fs.writeFile(outputPath, Buffer.from('cached-tile'))
        return {
          command: 'gdalwarp',
          args,
          stdout: '',
          stderr: '',
          durationMs: 1
        }
      }
    } as unknown as GdalRunnerService

    const service = new RasterGdalTileService(fakeRunner, cacheRoot)
    const request = createRequest()

    const first = await service.renderTile(request)
    const second = await service.renderTile(request)
    expect(first?.toString()).toBe('cached-tile')
    expect(second?.toString()).toBe('cached-tile')
    expect(runCalls).toBe(2)
    await expect(
      fs.access(
        join(cacheRoot, request.assetId, `${request.z}`, `${request.x}`, `${request.y}.png`)
      )
    ).rejects.toMatchObject({
      code: 'ENOENT'
    })
    service.shutdown()
  })

  it('disables failed assets until they are explicitly released', async () => {
    const cacheRoot = mkdtempSync(join(tmpdir(), 'arion-gdal-tile-test-'))
    cleanupPaths.push(cacheRoot)
    let runCalls = 0

    const fakeRunner = {
      getAvailability: async () => ({
        available: true,
        runtimePaths: {
          binDirectory: '/mock/bin',
          gdalDataDirectory: '/mock/share/gdal',
          projDirectory: '/mock/share/proj',
          gdalPluginsDirectory: null
        }
      }),
      run: async (...args: unknown[]) => {
        void args
        runCalls += 1
        throw new Error('forced failure')
      }
    } as unknown as GdalRunnerService

    const service = new RasterGdalTileService(fakeRunner, cacheRoot)
    const request = createRequest()

    await expect(service.renderTile(request)).rejects.toThrow('forced failure')
    await expect(service.renderTile(request)).rejects.toThrow(
      'GDAL tile rendering is disabled for this asset after a prior render failure'
    )
    expect(runCalls).toBe(1)

    await service.releaseAsset(request.assetId)
    await expect(service.renderTile(request)).rejects.toThrow('forced failure')
    expect(runCalls).toBe(2)
    service.shutdown()
  })

  it('selects RGB output bands for high-band rasters', async () => {
    const cacheRoot = mkdtempSync(join(tmpdir(), 'arion-gdal-tile-test-'))
    cleanupPaths.push(cacheRoot)
    const calls: Array<{ tool: string; args: string[] }> = []

    const fakeRunner = {
      getAvailability: async () => ({
        available: true,
        runtimePaths: {
          binDirectory: '/mock/bin',
          gdalDataDirectory: '/mock/share/gdal',
          projDirectory: '/mock/share/proj',
          gdalPluginsDirectory: null
        }
      }),
      run: async (tool: string, args: string[]) => {
        calls.push({ tool, args })
        const outputPath = args[args.length - 1]
        await fs.mkdir(dirname(outputPath), { recursive: true })
        await fs.writeFile(
          outputPath,
          Buffer.from(tool === 'gdal_translate' ? '<VRTDataset/>' : 'rgb-tile')
        )
        return {
          command: tool,
          args,
          stdout: '',
          stderr: '',
          durationMs: 1
        }
      }
    } as unknown as GdalRunnerService

    const service = new RasterGdalTileService(fakeRunner, cacheRoot)
    await service.renderTile(
      createRequest({
        bandCount: 20,
        sourceByteLike: false,
        bandRanges: [
          { min: 0, max: 10000 },
          { min: 0, max: 12000 },
          { min: 0, max: 8000 }
        ]
      })
    )

    const translateCall = calls.find((entry) => entry.tool === 'gdal_translate')
    expect(translateCall?.args).toEqual(
      expect.arrayContaining(['-of', 'VRT', '-b', '1', '-b', '2', '-b', '3'])
    )
    expect(translateCall?.args).toEqual(
      expect.arrayContaining([
        '-scale_1',
        '0',
        '10000',
        '0',
        '255',
        '-scale_2',
        '0',
        '12000',
        '0',
        '255',
        '-scale_3',
        '0',
        '8000',
        '0',
        '255',
        '-ot',
        'Byte'
      ])
    )
    const warpCall = calls.find((entry) => entry.tool === 'gdalwarp')
    expect(warpCall?.args).toBeDefined()
    expect(warpCall?.args.at(-2)?.endsWith('.vrt')).toBe(true)

    service.shutdown()
  })

  it('skips VRT generation for byte-like RGB rasters', async () => {
    const cacheRoot = mkdtempSync(join(tmpdir(), 'arion-gdal-tile-test-'))
    cleanupPaths.push(cacheRoot)
    const calls: Array<{ tool: string; args: string[] }> = []

    const fakeRunner = {
      getAvailability: async () => ({
        available: true,
        runtimePaths: {
          binDirectory: '/mock/bin',
          gdalDataDirectory: '/mock/share/gdal',
          projDirectory: '/mock/share/proj',
          gdalPluginsDirectory: null
        }
      }),
      run: async (tool: string, args: string[]) => {
        calls.push({ tool, args })
        const outputPath = args[args.length - 1]
        await fs.mkdir(dirname(outputPath), { recursive: true })
        await fs.writeFile(outputPath, Buffer.from('tile-data'))
        return {
          command: tool,
          args,
          stdout: '',
          stderr: '',
          durationMs: 1
        }
      }
    } as unknown as GdalRunnerService

    const service = new RasterGdalTileService(fakeRunner, cacheRoot)
    await service.renderTile(createRequest({ bandCount: 3, sourceByteLike: true }))

    expect(calls.map((call) => call.tool)).toEqual(['gdalwarp'])
    service.shutdown()
  })

  it('applies byte scaling for non-byte single-band rasters', async () => {
    const cacheRoot = mkdtempSync(join(tmpdir(), 'arion-gdal-tile-test-'))
    cleanupPaths.push(cacheRoot)
    const calls: Array<{ tool: string; args: string[] }> = []

    const fakeRunner = {
      getAvailability: async () => ({
        available: true,
        runtimePaths: {
          binDirectory: '/mock/bin',
          gdalDataDirectory: '/mock/share/gdal',
          projDirectory: '/mock/share/proj',
          gdalPluginsDirectory: null
        }
      }),
      run: async (tool: string, args: string[]) => {
        calls.push({ tool, args })
        const outputPath = args[args.length - 1]
        await fs.mkdir(dirname(outputPath), { recursive: true })
        await fs.writeFile(
          outputPath,
          Buffer.from(tool === 'gdal_translate' ? '<VRTDataset/>' : 'tile-data')
        )
        return {
          command: tool,
          args,
          stdout: '',
          stderr: '',
          durationMs: 1
        }
      }
    } as unknown as GdalRunnerService

    const service = new RasterGdalTileService(fakeRunner, cacheRoot)
    await service.renderTile(
      createRequest({
        bandCount: 1,
        sourceByteLike: false,
        bandRanges: [{ min: 0, max: 1 }]
      })
    )

    const translateCall = calls.find((entry) => entry.tool === 'gdal_translate')
    expect(translateCall?.args).toEqual(
      expect.arrayContaining(['-scale_1', '0', '1', '0', '255', '-ot', 'Byte'])
    )
    expect(calls.some((entry) => entry.tool === 'gdalwarp')).toBe(true)
    service.shutdown()
  })
})
