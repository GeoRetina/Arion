import { promises as fs } from 'fs'
import { cpus } from 'os'
import { join } from 'path'
import { app } from 'electron'
import type { BoundingBox, SupportedRasterCrs } from './raster-types'
import { lonLatToWebMercator, TILE_SIZE } from './raster-coordinate-utils'
import { getGdalRunnerService, type GdalRunnerService } from './gdal-runner-service'

const GDAL_TILE_CACHE_DIR = 'gdal-tile-cache'
const GDAL_TILE_RENDER_TIMEOUT_MS = 45 * 1000
const GDAL_TILE_DISABLE_COOLDOWN_MS = 8 * 1000
const DEFAULT_GDAL_TILE_THREAD_COUNT = 1
const DEFAULT_GDAL_TILE_CONCURRENCY = Math.max(1, Math.min(2, cpus().length - 1))

export interface RasterGdalTileRenderRequest {
  assetId: string
  z: number
  x: number
  y: number
  bandCount: number
  bandRanges: Array<{ min: number; max: number }>
  paletteIndexed: boolean
  sourceByteLike: boolean
  crs: SupportedRasterCrs
  mapBounds: BoundingBox
  sourceFilePath: string
  transparentTilePng: Buffer
}

export class RasterGdalTileService {
  private readonly disabledAssets = new Map<string, number>()
  private readonly pendingTiles = new Map<string, Promise<Buffer>>()
  private readonly pendingBandLimitedSources = new Map<string, Promise<string>>()
  private readonly waiters: Array<() => void> = []
  private activeJobs = 0

  constructor(
    private readonly gdalRunner: GdalRunnerService = getGdalRunnerService(),
    private readonly cacheRootPath: string = resolveDefaultCacheRootPath()
  ) {}

  async ensureTileRenderingAvailable(): Promise<void> {
    this.assertRuntimeEnabled()
    const availability = await this.gdalRunner.getAvailability()
    if (!availability.available) {
      throw new Error(availability.reason || 'GDAL is not available for tile rendering')
    }
  }

  async renderTile(request: RasterGdalTileRenderRequest): Promise<Buffer> {
    this.assertTileRenderingEnabled(request.assetId, request.crs)
    await this.ensureTileRenderingAvailable()

    const cacheKey = this.toCacheKey(request)
    const pending = this.pendingTiles.get(cacheKey)
    if (pending) {
      return pending
    }

    const renderPromise = this.withRenderSlot(
      async () => await this.renderTileInternal(request)
    ).finally(() => {
      this.pendingTiles.delete(cacheKey)
    })

    this.pendingTiles.set(cacheKey, renderPromise)
    return renderPromise
  }

  async releaseAsset(assetId: string): Promise<void> {
    this.disabledAssets.delete(assetId)
    await this.safeRemoveDirectory(this.getAssetCachePath(assetId))
  }

  shutdown(): void {
    this.disabledAssets.clear()
    this.pendingTiles.clear()
    this.pendingBandLimitedSources.clear()
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift()
      waiter?.()
    }
    this.activeJobs = 0
  }

  private async renderTileInternal(request: RasterGdalTileRenderRequest): Promise<Buffer> {
    const tilePath = this.getTileCachePath(request)
    const warpInputPath = await this.resolveWarpInputPath(request)

    try {
      const cachedTile = await fs.readFile(tilePath)
      if (cachedTile.length > 0) {
        return cachedTile
      }
      return request.transparentTilePng
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        this.disableAsset(request.assetId, 'failed to read cached GDAL tile', error)
        throw new Error('GDAL tile cache is unreadable for this asset')
      }
    }

    const [minX, minY] = lonLatToWebMercator(request.mapBounds[0], request.mapBounds[1])
    const [maxX, maxY] = lonLatToWebMercator(request.mapBounds[2], request.mapBounds[3])
    const threadCount = resolveGdalTileThreadCount()
    const threadCountString = String(threadCount)

    try {
      await fs.mkdir(this.getTileDirectoryPath(request), { recursive: true })
      await this.safeRemoveFile(tilePath)

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
          '-te',
          `${minX}`,
          `${minY}`,
          `${maxX}`,
          `${maxY}`,
          '-ts',
          String(TILE_SIZE),
          String(TILE_SIZE),
          '-dstalpha',
          '-of',
          'PNG',
          '-overwrite',
          warpInputPath,
          tilePath
        ],
        { timeoutMs: GDAL_TILE_RENDER_TIMEOUT_MS }
      )

      const renderedTile = await fs.readFile(tilePath)
      if (renderedTile.length > 0) {
        return renderedTile
      }

      return request.transparentTilePng
    } catch (error) {
      await this.safeRemoveFile(tilePath)
      this.disableAsset(request.assetId, 'failed to render GDAL tile', error)
      throw new Error(
        error instanceof Error ? error.message : 'GDAL tile rendering failed unexpectedly'
      )
    }
  }

  private assertTileRenderingEnabled(assetId: string, _crs: SupportedRasterCrs): void {
    this.assertRuntimeEnabled()

    if (!this.isSupportedCrs(_crs)) {
      throw new Error(`Unsupported CRS for GDAL tile rendering: ${_crs}`)
    }

    const disabledUntil = this.disabledAssets.get(assetId)
    if (typeof disabledUntil === 'number') {
      if (disabledUntil > Date.now()) {
        throw new Error(
          'GDAL tile rendering is disabled for this asset after a prior render failure'
        )
      }
      this.disabledAssets.delete(assetId)
    }
  }

  private isSupportedCrs(crs: SupportedRasterCrs): boolean {
    return crs === 'EPSG:4326' || crs === 'EPSG:3857'
  }

  private assertRuntimeEnabled(): void {
    if (process.env.ARION_GDAL_TILE_RENDER === '0') {
      throw new Error('GDAL tile rendering is disabled by ARION_GDAL_TILE_RENDER=0')
    }
  }

  private async withRenderSlot<T>(job: () => Promise<T>): Promise<T> {
    await this.acquireRenderSlot()
    try {
      return await job()
    } finally {
      this.releaseRenderSlot()
    }
  }

  private async acquireRenderSlot(): Promise<void> {
    const maxConcurrentJobs = resolveGdalTileConcurrency()
    if (this.activeJobs < maxConcurrentJobs) {
      this.activeJobs += 1
      return
    }

    await new Promise<void>((resolve) => {
      this.waiters.push(() => {
        this.activeJobs += 1
        resolve()
      })
    })
  }

  private releaseRenderSlot(): void {
    this.activeJobs = Math.max(0, this.activeJobs - 1)
    const next = this.waiters.shift()
    next?.()
  }

  private toCacheKey(request: RasterGdalTileRenderRequest): string {
    return `${request.assetId}:${request.z}:${request.x}:${request.y}`
  }

  private getTileDirectoryPath(request: RasterGdalTileRenderRequest): string {
    return join(this.getAssetCachePath(request.assetId), `${request.z}`, `${request.x}`)
  }

  private getTileCachePath(request: RasterGdalTileRenderRequest): string {
    return join(this.getTileDirectoryPath(request), `${request.y}.png`)
  }

  private getAssetCachePath(assetId: string): string {
    return join(this.cacheRootPath, assetId)
  }

  private disableAsset(assetId: string, reason: string, error: unknown): void {
    this.disabledAssets.set(assetId, Date.now() + resolveAssetDisableCooldownMs())
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`Disabling GDAL tile rendering for ${assetId}: ${reason}: ${message}`)
  }

  private async resolveWarpInputPath(request: RasterGdalTileRenderRequest): Promise<string> {
    if (request.paletteIndexed) {
      return request.sourceFilePath
    }

    const selectedBands = resolveVisualizationBands(request.bandCount)
    const scaleRanges = resolveScaleRanges(
      selectedBands,
      request.bandRanges,
      request.sourceByteLike
    )
    const needsBandSelection = hasCustomBandSelection(selectedBands, request.bandCount)
    if (!needsBandSelection && scaleRanges.length === 0) {
      return request.sourceFilePath
    }

    return await this.getOrCreateBandLimitedSource(request, selectedBands, scaleRanges)
  }

  private async getOrCreateBandLimitedSource(
    request: RasterGdalTileRenderRequest,
    selectedBands: number[],
    scaleRanges: Array<{ min: number; max: number }>
  ): Promise<string> {
    const scaleRangesKey = serializeScaleRanges(scaleRanges)
    const visualizationProfileKey = `${selectedBands.join('-')}-${scaleRangesKey}`
    const cacheKey = `${request.assetId}:${visualizationProfileKey}`
    const pending = this.pendingBandLimitedSources.get(cacheKey)
    if (pending) {
      return pending
    }

    const bandLimitedPath = join(
      this.getAssetCachePath(request.assetId),
      `source-bands-${visualizationProfileKey}.vrt`
    )

    const creation = this.createBandLimitedSource(
      request,
      selectedBands,
      scaleRanges,
      bandLimitedPath
    ).finally(() => {
      this.pendingBandLimitedSources.delete(cacheKey)
    })
    this.pendingBandLimitedSources.set(cacheKey, creation)
    return await creation
  }

  private async createBandLimitedSource(
    request: RasterGdalTileRenderRequest,
    selectedBands: number[],
    scaleRanges: Array<{ min: number; max: number }>,
    outputPath: string
  ): Promise<string> {
    const existing = await this.readIfExists(outputPath)
    if (existing && existing.length > 0) {
      return outputPath
    }

    await fs.mkdir(this.getAssetCachePath(request.assetId), { recursive: true })
    await this.safeRemoveFile(outputPath)

    try {
      const translateArgs = [
        '-of',
        'VRT',
        ...buildTranslateBandArgs(selectedBands),
        ...buildTranslateScaleArgs(scaleRanges),
        ...(scaleRanges.length > 0 ? ['-ot', 'Byte'] : []),
        request.sourceFilePath,
        outputPath
      ]

      await this.gdalRunner.run('gdal_translate', translateArgs, {
        timeoutMs: GDAL_TILE_RENDER_TIMEOUT_MS
      })
      return outputPath
    } catch (error) {
      await this.safeRemoveFile(outputPath)
      this.disableAsset(request.assetId, 'failed to create band-limited source', error)
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to create a GDAL VRT for visualization band selection'
      )
    }
  }

  private async readIfExists(path: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(path)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        return null
      }
      throw error
    }
  }

  private async safeRemoveFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        throw error
      }
    }
  }

  private async safeRemoveDirectory(path: string): Promise<void> {
    try {
      await fs.rm(path, { recursive: true, force: true })
    } catch {
      // Ignore cache cleanup errors during asset lifecycle updates.
    }
  }
}

function resolveDefaultCacheRootPath(): string {
  return join(app.getPath('userData'), 'raster-assets', GDAL_TILE_CACHE_DIR)
}

function resolveGdalTileThreadCount(): number {
  const configured = Number(process.env.ARION_GDAL_TILE_THREADS)
  if (Number.isInteger(configured) && configured > 0 && configured <= 16) {
    return configured
  }

  return DEFAULT_GDAL_TILE_THREAD_COUNT
}

function resolveGdalTileConcurrency(): number {
  const configured = Number(process.env.ARION_GDAL_TILE_CONCURRENCY)
  if (Number.isInteger(configured) && configured > 0 && configured <= 8) {
    return configured
  }

  return DEFAULT_GDAL_TILE_CONCURRENCY
}

function resolveAssetDisableCooldownMs(): number {
  const configured = Number(process.env.ARION_GDAL_TILE_DISABLE_COOLDOWN_MS)
  if (Number.isInteger(configured) && configured >= 0 && configured <= 120_000) {
    return configured
  }

  return GDAL_TILE_DISABLE_COOLDOWN_MS
}

let rasterGdalTileService: RasterGdalTileService | null = null

export function getRasterGdalTileService(): RasterGdalTileService {
  if (!rasterGdalTileService) {
    rasterGdalTileService = new RasterGdalTileService()
  }

  return rasterGdalTileService
}

export const __testing = {
  resolveVisualizationBands,
  resolveScaleRanges,
  buildTranslateBandArgs,
  buildTranslateScaleArgs,
  hasCustomBandSelection,
  resolveGdalTileThreadCount,
  resolveGdalTileConcurrency
}

function resolveVisualizationBands(bandCount: number): number[] {
  if (!Number.isFinite(bandCount) || bandCount <= 0) {
    return [1]
  }

  if (bandCount === 1 || bandCount === 2) {
    return [1]
  }

  if (bandCount === 4) {
    return [1, 2, 3]
  }

  return [1, 2, 3]
}

function buildTranslateBandArgs(bands: number[]): string[] {
  return bands.flatMap((band) => ['-b', String(band)])
}

function buildTranslateScaleArgs(scaleRanges: Array<{ min: number; max: number }>): string[] {
  return scaleRanges.flatMap((range, index) => [
    `-scale_${index + 1}`,
    String(range.min),
    String(range.max),
    '0',
    '255'
  ])
}

function resolveScaleRanges(
  selectedBands: number[],
  sourceRanges: Array<{ min: number; max: number }>,
  sourceByteLike: boolean
): Array<{ min: number; max: number }> {
  if (sourceByteLike) {
    return []
  }

  return selectedBands
    .map((sourceBandNumber) => sourceRanges[sourceBandNumber - 1])
    .map((range) => normalizeScaleRange(range))
    .filter((range): range is { min: number; max: number } => Boolean(range))
}

function normalizeScaleRange(
  range: { min: number; max: number } | undefined
): { min: number; max: number } | null {
  if (!range) {
    return null
  }

  if (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.max <= range.min) {
    return null
  }

  return {
    min: Math.trunc(range.min),
    max: Math.trunc(range.max)
  }
}

function serializeScaleRanges(scaleRanges: Array<{ min: number; max: number }>): string {
  if (scaleRanges.length === 0) {
    return 'none'
  }

  return scaleRanges.map((range) => `${range.min}-${range.max}`).join('_')
}

function hasCustomBandSelection(selectedBands: number[], sourceBandCount: number): boolean {
  if (selectedBands.length !== sourceBandCount) {
    return true
  }

  for (let index = 0; index < selectedBands.length; index += 1) {
    if (selectedBands[index] !== index + 1) {
      return true
    }
  }

  return false
}
