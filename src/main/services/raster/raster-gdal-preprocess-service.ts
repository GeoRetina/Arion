import { promises as fs } from 'fs'
import { cpus } from 'os'
import { getGdalRunnerService, type GdalRunnerService } from './gdal-runner-service'

const GDAL_INFO_TIMEOUT_MS = 30 * 1000
const GDAL_WARP_TIMEOUT_MS = 30 * 60 * 1000
const GDAL_ADDO_TIMEOUT_MS = 20 * 60 * 1000
const GDAL_TRANSLATE_TIMEOUT_MS = 30 * 60 * 1000
const GDAL_STATS_TIMEOUT_MS = 10 * 60 * 1000
const WEB_MERCATOR_EPSG_CODES = new Set([3857, 3785, 900913])
const OVERVIEW_MIN_DIMENSION = 256
const OVERVIEW_MAX_FACTOR = 512
const DEFAULT_GDAL_THREAD_COUNT = Math.max(1, Math.min(4, cpus().length - 1))

export type RasterPreprocessStage = 'inspect' | 'reproject' | 'overview' | 'translate'

export interface RasterPreprocessProgressUpdate {
  stage: RasterPreprocessStage
  progress: number
  message: string
}

export interface RasterPreprocessRequest {
  assetId: string
  inputPath: string
  outputPath: string
  onProgress?: (update: RasterPreprocessProgressUpdate) => void
}

export interface RasterPreprocessResult {
  success: boolean
  processingEngine: 'gdal' | 'geotiff-js'
  sourceEpsg: number | null
  reprojected: boolean
  usedCogDriver: boolean
  warning?: string
}

interface GdalInfoPayload {
  size?: [number, number]
  stac?: Record<string, unknown>
  coordinateSystem?: {
    wkt?: string
    projjson?: {
      id?: {
        authority?: string
        code?: number | string
      }
    }
  }
}

export class RasterGdalPreprocessService {
  constructor(private readonly gdalRunner: GdalRunnerService = getGdalRunnerService()) {}

  async preprocessGeoTiff(request: RasterPreprocessRequest): Promise<RasterPreprocessResult> {
    const availability = await this.gdalRunner.getAvailability()
    if (!availability.available) {
      return {
        success: false,
        processingEngine: 'geotiff-js',
        sourceEpsg: null,
        reprojected: false,
        usedCogDriver: false,
        warning: availability.reason || 'GDAL binaries are not available'
      }
    }

    let sourceEpsg: number | null = null
    let reprojected = false
    const usedCogDriver = false
    let warning: string | undefined
    const threadCount = resolveGdalThreadCount()
    const threadCountString = String(threadCount)
    const inPlaceOutput = request.inputPath === request.outputPath
    const outputOverviewPath = `${request.outputPath}.ovr`
    const outputAuxMetadataPath = `${request.outputPath}.aux.xml`

    try {
      if (!inPlaceOutput) {
        await safeUnlink(request.outputPath)
        await safeUnlink(outputOverviewPath)
        await safeUnlink(outputAuxMetadataPath)
      }

      request.onProgress?.({
        stage: 'inspect',
        progress: 18,
        message: 'Inspecting raster metadata with GDAL'
      })

      const sourceInfo = await this.readGdalInfo(request.inputPath)
      sourceEpsg = extractEpsgCode(sourceInfo)
      const shouldReproject = sourceEpsg === null || !WEB_MERCATOR_EPSG_CODES.has(sourceEpsg)

      if (inPlaceOutput && shouldReproject) {
        return {
          success: false,
          processingEngine: 'geotiff-js',
          sourceEpsg,
          reprojected: false,
          usedCogDriver,
          warning:
            'Source raster is not EPSG:4326 or EPSG:3857, so auxiliary files cannot be prepared in place'
        }
      }

      if (shouldReproject) {
        reprojected = true
        request.onProgress?.({
          stage: 'reproject',
          progress: 42,
          message: 'Reprojecting raster to Web Mercator'
        })

        await this.gdalRunner.run(
          'gdalwarp',
          [
            '--config',
            'GDAL_NUM_THREADS',
            threadCountString,
            '-multi',
            '-wo',
            `NUM_THREADS=${threadCountString}`,
            '-r',
            'bilinear',
            '-t_srs',
            'EPSG:3857',
            '-dstalpha',
            '-of',
            'GTiff',
            '-co',
            'TILED=YES',
            '-co',
            'COMPRESS=DEFLATE',
            '-co',
            'BIGTIFF=IF_SAFER',
            '-co',
            'BLOCKXSIZE=512',
            '-co',
            'BLOCKYSIZE=512',
            request.inputPath,
            request.outputPath
          ],
          { timeoutMs: GDAL_WARP_TIMEOUT_MS }
        )
      } else if (!inPlaceOutput) {
        request.onProgress?.({
          stage: 'translate',
          progress: 46,
          message: 'Normalizing GeoTIFF layout'
        })

        await this.gdalRunner.run(
          'gdal_translate',
          [
            '-of',
            'GTiff',
            '-co',
            'TILED=YES',
            '-co',
            'COMPRESS=DEFLATE',
            '-co',
            'BIGTIFF=IF_SAFER',
            '-co',
            `NUM_THREADS=${threadCountString}`,
            '-co',
            'BLOCKXSIZE=512',
            '-co',
            'BLOCKYSIZE=512',
            request.inputPath,
            request.outputPath
          ],
          { timeoutMs: GDAL_TRANSLATE_TIMEOUT_MS }
        )
      }

      const targetInfo = inPlaceOutput ? sourceInfo : await this.readGdalInfo(request.outputPath)
      const [width, height] = getRasterDimensions(targetInfo)
      const overviewFactors = computeOverviewFactors(width, height)

      if (overviewFactors.length > 0 && !(await hasNonEmptyFile(outputOverviewPath))) {
        request.onProgress?.({
          stage: 'overview',
          progress: 64,
          message: 'Building external overview pyramid'
        })

        try {
          await this.gdalRunner.run(
            'gdaladdo',
            [
              '--config',
              'GDAL_NUM_THREADS',
              threadCountString,
              '--config',
              'COMPRESS_OVERVIEW',
              'DEFLATE',
              '--config',
              'BIGTIFF_OVERVIEW',
              'IF_SAFER',
              '-ro',
              '-r',
              'average',
              request.outputPath,
              ...overviewFactors.map((factor) => String(factor))
            ],
            { timeoutMs: GDAL_ADDO_TIMEOUT_MS }
          )
        } catch (error) {
          warning = appendWarning(
            warning,
            error instanceof Error
              ? `Failed to build overviews: ${error.message}`
              : 'Failed to build overviews'
          )
        }
      }

      request.onProgress?.({
        stage: 'translate',
        progress: 82,
        message: 'Computing raster statistics metadata'
      })

      if (!(await hasNonEmptyFile(outputAuxMetadataPath))) {
        try {
          await this.gdalRunner.run(
            'gdalinfo',
            ['--config', 'GDAL_PAM_ENABLED', 'YES', '-stats', request.outputPath],
            { timeoutMs: GDAL_STATS_TIMEOUT_MS }
          )
        } catch (error) {
          warning = appendWarning(
            warning,
            error instanceof Error
              ? `Failed to compute auxiliary statistics metadata: ${error.message}`
              : 'Failed to compute auxiliary statistics metadata'
          )
        }
      }

      return {
        success: true,
        processingEngine: 'gdal',
        sourceEpsg,
        reprojected,
        usedCogDriver,
        warning
      }
    } catch (error) {
      if (!inPlaceOutput) {
        await safeUnlink(request.outputPath)
        await safeUnlink(outputOverviewPath)
        await safeUnlink(outputAuxMetadataPath)
      }
      const message = error instanceof Error ? error.message : 'Unknown GDAL preprocessing failure'

      return {
        success: false,
        processingEngine: 'geotiff-js',
        sourceEpsg,
        reprojected,
        usedCogDriver,
        warning: appendWarning(warning, message)
      }
    }
  }

  private async readGdalInfo(path: string): Promise<GdalInfoPayload> {
    const result = await this.gdalRunner.run('gdalinfo', ['-json', path], {
      timeoutMs: GDAL_INFO_TIMEOUT_MS
    })

    try {
      return JSON.parse(result.stdout) as GdalInfoPayload
    } catch {
      return {}
    }
  }
}

function getRasterDimensions(info: GdalInfoPayload): [number, number] {
  const width = info.size?.[0]
  const height = info.size?.[1]

  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return [0, 0]
  }

  return [Math.trunc(width), Math.trunc(height)]
}

function extractEpsgCode(info: GdalInfoPayload): number | null {
  const stacValue = info.stac?.['proj:epsg']
  if (typeof stacValue === 'number' && Number.isInteger(stacValue) && stacValue > 0) {
    return stacValue
  }

  if (typeof stacValue === 'string') {
    const parsed = Number(stacValue)
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed
    }
  }

  const authority = info.coordinateSystem?.projjson?.id?.authority
  const projjsonCode = info.coordinateSystem?.projjson?.id?.code
  if (authority?.toUpperCase() === 'EPSG') {
    if (typeof projjsonCode === 'number' && Number.isInteger(projjsonCode) && projjsonCode > 0) {
      return projjsonCode
    }

    if (typeof projjsonCode === 'string') {
      const parsed = Number(projjsonCode)
      if (Number.isInteger(parsed) && parsed > 0) {
        return parsed
      }
    }
  }

  const wkt = info.coordinateSystem?.wkt
  if (typeof wkt === 'string') {
    const matches = Array.from(wkt.matchAll(/ID\["EPSG",\s*(\d+)\]/gu))
    const finalMatch = matches[matches.length - 1]?.[1]
    if (finalMatch) {
      const parsed = Number(finalMatch)
      if (Number.isInteger(parsed) && parsed > 0) {
        return parsed
      }
    }
  }

  return null
}

export function computeOverviewFactors(width: number, height: number): number[] {
  const maxDimension = Math.max(width, height)
  if (!Number.isFinite(maxDimension) || maxDimension <= OVERVIEW_MIN_DIMENSION) {
    return []
  }

  const factors: number[] = []
  for (let factor = 2; factor <= OVERVIEW_MAX_FACTOR; factor *= 2) {
    if (maxDimension / factor < OVERVIEW_MIN_DIMENSION) {
      break
    }

    factors.push(factor)
  }

  return factors
}

function resolveGdalThreadCount(): number {
  const configured = Number(process.env.ARION_GDAL_THREADS)
  if (Number.isInteger(configured) && configured > 0 && configured <= 64) {
    return configured
  }

  return DEFAULT_GDAL_THREAD_COUNT
}

function appendWarning(existing: string | undefined, next: string): string {
  if (!existing) {
    return next
  }

  return `${existing}; ${next}`
}

async function hasNonEmptyFile(path: string): Promise<boolean> {
  try {
    const stats = await fs.stat(path)
    return stats.isFile() && stats.size > 0
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return false
    }
    throw error
  }
}

async function safeUnlink(path: string): Promise<void> {
  try {
    await fs.unlink(path)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      throw error
    }
  }
}

let rasterGdalPreprocessService: RasterGdalPreprocessService | null = null

export function getRasterGdalPreprocessService(): RasterGdalPreprocessService {
  if (!rasterGdalPreprocessService) {
    rasterGdalPreprocessService = new RasterGdalPreprocessService()
  }

  return rasterGdalPreprocessService
}

export const __testing = {
  extractEpsgCode,
  getRasterDimensions
}
