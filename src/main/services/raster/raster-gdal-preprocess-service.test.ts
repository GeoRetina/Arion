import { promises as fs } from 'fs'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { type GdalRunnerService } from './gdal-runner-service'
import {
  __testing,
  computeOverviewFactors,
  RasterGdalPreprocessService
} from './raster-gdal-preprocess-service'

describe('raster-gdal-preprocess-service', () => {
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

  it('computes overview factors for large rasters', () => {
    const factors = computeOverviewFactors(8192, 4096)
    expect(factors).toEqual([2, 4, 8, 16, 32])
  })

  it('returns no overviews for small rasters', () => {
    expect(computeOverviewFactors(200, 200)).toEqual([])
  })

  it('extracts EPSG from STAC metadata', () => {
    const epsg = __testing.extractEpsgCode({
      stac: {
        'proj:epsg': 3857
      }
    })
    expect(epsg).toBe(3857)
  })

  it('extracts EPSG from PROJJSON metadata', () => {
    const epsg = __testing.extractEpsgCode({
      coordinateSystem: {
        projjson: {
          id: {
            authority: 'EPSG',
            code: '4326'
          }
        }
      }
    })
    expect(epsg).toBe(4326)
  })

  it('extracts EPSG from WKT metadata', () => {
    const epsg = __testing.extractEpsgCode({
      coordinateSystem: {
        wkt: 'PROJCRS["WGS 84 / Pseudo-Mercator",ID["EPSG",3857]]'
      }
    })
    expect(epsg).toBe(3857)
  })

  it('reuses existing in-place overview and aux sidecars', async () => {
    const root = mkdtempSync(join(tmpdir(), 'arion-raster-preprocess-test-'))
    cleanupPaths.push(root)
    const rasterPath = join(root, 'source.tif')
    await fs.writeFile(rasterPath, 'dummy')
    await fs.writeFile(`${rasterPath}.ovr`, 'overview')
    await fs.writeFile(`${rasterPath}.aux.xml`, '<PAMDataset/>')

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
        if (tool === 'gdalinfo' && args[0] === '-json') {
          return {
            command: tool,
            args,
            stdout: JSON.stringify({ size: [4096, 4096], stac: { 'proj:epsg': 3857 } }),
            stderr: '',
            durationMs: 1
          }
        }

        return {
          command: tool,
          args,
          stdout: '',
          stderr: '',
          durationMs: 1
        }
      }
    } as unknown as GdalRunnerService

    const service = new RasterGdalPreprocessService(fakeRunner)
    const result = await service.preprocessGeoTiff({
      assetId: 'asset-1',
      inputPath: rasterPath,
      outputPath: rasterPath
    })

    expect(result.success).toBe(true)
    expect(calls.filter((call) => call.tool === 'gdaladdo')).toHaveLength(0)
    expect(
      calls.filter((call) => call.tool === 'gdalinfo' && call.args.includes('-stats'))
    ).toHaveLength(0)
  })

  it('returns a non-fatal in-place warning for unsupported CRS', async () => {
    const root = mkdtempSync(join(tmpdir(), 'arion-raster-preprocess-test-'))
    cleanupPaths.push(root)
    const rasterPath = join(root, 'source.tif')
    await fs.writeFile(rasterPath, 'dummy')

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
        return {
          command: tool,
          args,
          stdout: JSON.stringify({ size: [2048, 2048], stac: { 'proj:epsg': 32633 } }),
          stderr: '',
          durationMs: 1
        }
      }
    } as unknown as GdalRunnerService

    const service = new RasterGdalPreprocessService(fakeRunner)
    const result = await service.preprocessGeoTiff({
      assetId: 'asset-2',
      inputPath: rasterPath,
      outputPath: rasterPath
    })

    expect(result.success).toBe(false)
    expect(result.warning).toContain('cannot be prepared in place')
    expect(calls.map((call) => call.tool)).toEqual(['gdalinfo'])
  })
})
