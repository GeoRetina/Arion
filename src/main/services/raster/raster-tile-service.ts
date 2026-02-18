import { promises as fs } from 'fs'
import { randomUUID } from 'crypto'
import { join, resolve } from 'path'
import { cpus, tmpdir } from 'os'
import { app } from 'electron'
import { fromFile as geoTiffFromFile, Pool } from 'geotiff'
import type { GeoTIFF, GeoTIFFImage, ReadRasterResult } from 'geotiff'
import { encode as encodePng } from 'fast-png'
import {
  inferNativeMaxZoom,
  intersection,
  lonLatToWebMercator,
  mapBoundsToSourceBounds,
  sourceBoundsToMapBounds,
  tileToLonLatBounds,
  TILE_SIZE,
  validateBoundingBox
} from './raster-coordinate-utils'
import { getGdalRunnerService, type GdalRunnerService } from './gdal-runner-service'
import { getRasterGdalPreprocessService } from './raster-gdal-preprocess-service'
import type {
  BoundingBox,
  GeoTiffAssetProcessingStatus,
  RasterTileRequest,
  RegisterGeoTiffAssetRequest,
  RegisterGeoTiffAssetResult,
  SupportedRasterCrs
} from './raster-types'

const RASTER_ASSETS_DIR = 'raster-assets'
const TILE_CACHE_MAX_ENTRIES = 1024
const MAX_OPEN_ASSET_CONTEXTS = 12
const VALID_ASSET_ID_PATTERN = /^[a-f0-9-]{36}$/i
const VALID_JOB_ID_PATTERN = /^[a-f0-9-]{36}$/i
const PROCESSING_STATUS_TTL_MS = 5 * 60 * 1000
const STALE_CONTEXT_CLOSE_DELAY_MS = 30 * 1000
const POST_SWAP_CACHE_CLEAR_DELAY_MS = 1500
const GDAL_TILE_CACHE_DIR = 'gdal-tile-cache'
const GDAL_TILE_RENDER_TIMEOUT_MS = 45 * 1000
const DEFAULT_GDAL_TILE_THREAD_COUNT = 1
const MAX_CONCURRENT_TILE_RENDERS = Math.max(1, Math.min(4, cpus().length - 1))

interface CachedTileEntry {
  data: Buffer
}

interface RasterImageLevel {
  index: number
  image: GeoTIFFImage
  width: number
  height: number
  bounds: BoundingBox
}

interface RasterImageLevelCandidate {
  index: number
  image: GeoTIFFImage
  width: number
  height: number
  bounds: BoundingBox | null
}

interface RasterAssetContext {
  assetId: string
  filePath: string
  tiff: GeoTIFF
  levels: RasterImageLevel[]
  crs: SupportedRasterCrs
  sourceBounds: BoundingBox
  mapBounds: BoundingBox
  width: number
  height: number
  bandCount: number
  bandRanges: BandRange[]
  noDataValue: number | null
  minZoom: number
  maxZoom: number
}

interface TileRect {
  x: number
  y: number
  width: number
  height: number
}

interface BandRange {
  min: number
  max: number
}

interface MaterializedRasterInput {
  path: string
  cleanupDirectory: string | null
}

export class RasterTileService {
  private readonly decoderPool: Pool
  private readonly gdalRunner: GdalRunnerService = getGdalRunnerService()
  private readonly preprocessService = getRasterGdalPreprocessService()
  private readonly openAssetContexts = new Map<string, RasterAssetContext>()
  private readonly assetActivePaths = new Map<string, string>()
  private readonly pendingOptimizationJobs = new Map<string, Promise<void>>()
  private readonly gdalTileRenderDisabledAssets = new Set<string>()
  private readonly tileCache = new Map<string, CachedTileEntry>()
  private readonly pendingTiles = new Map<string, Promise<Buffer>>()
  private readonly processingStatusByJobId = new Map<string, GeoTiffAssetProcessingStatus>()
  private readonly processingStatusCleanupTimers = new Map<string, NodeJS.Timeout>()
  private readonly staleContextCloseTimers = new Set<NodeJS.Timeout>()
  private readonly tileRenderWaiters: Array<() => void> = []
  private readonly transparentTilePng: Buffer
  private activeTileRenderCount = 0

  constructor() {
    const poolSize = Math.max(1, Math.min(4, cpus().length - 1))
    this.decoderPool = new Pool(poolSize)
    this.transparentTilePng = this.createTransparentTile()
  }

  getTileUrlTemplate(assetId: string): string {
    return `arion-raster://tiles/${assetId}/{z}/{x}/{y}.png`
  }

  async registerGeoTiffAsset(
    request: RegisterGeoTiffAssetRequest
  ): Promise<RegisterGeoTiffAssetResult> {
    await this.ensureAssetsDirectory()

    const assetId = randomUUID()
    const destinationPath = this.getAssetPath(assetId)
    const jobId = this.resolveJobId(request.jobId)
    const nowIso = new Date().toISOString()
    this.setProcessingStatus({
      jobId,
      stage: 'queued',
      progress: 0,
      message: 'Raster import queued',
      startedAt: nowIso,
      updatedAt: nowIso
    })

    let materializedInput: MaterializedRasterInput | null = null

    try {
      this.updateProcessingStatus(jobId, {
        stage: 'preparing',
        progress: 6,
        message: 'Preparing GeoTIFF source'
      })
      materializedInput = await this.materializeInput(request, assetId)

      this.updateProcessingStatus(jobId, {
        stage: 'validating',
        progress: 12,
        message: 'Validating TIFF header'
      })
      await this.assertGeoTiffMagic(materializedInput.path)

      this.updateProcessingStatus(jobId, {
        stage: 'loading',
        progress: 20,
        message: 'Loading raster for first paint'
      })
      await fs.copyFile(materializedInput.path, destinationPath)

      this.updateProcessingStatus(jobId, {
        stage: 'loading',
        progress: 30,
        message: 'Creating initial raster context'
      })
      const context = await this.loadAssetContext(assetId, destinationPath)
      this.assetActivePaths.set(assetId, destinationPath)
      this.touchAssetContext(assetId, context)
      await this.enforceOpenAssetContextLimit(assetId)

      this.updateProcessingStatus(jobId, {
        assetId,
        stage: 'preprocessing',
        progress: 36,
        message: 'Raster visible. Running GDAL optimization in background',
        processingEngine: 'geotiff-js'
      })
      this.startBackgroundOptimization(assetId, destinationPath, jobId)

      return {
        assetId,
        tilesUrlTemplate: this.getTileUrlTemplate(assetId),
        bounds: context.mapBounds,
        sourceBounds: context.sourceBounds,
        crs: context.crs,
        width: context.width,
        height: context.height,
        bandCount: context.bandCount,
        minZoom: context.minZoom,
        maxZoom: context.maxZoom,
        processingEngine: 'geotiff-js'
      }
    } catch (error) {
      await this.safeRemoveAssetFile(destinationPath)
      await this.safeRemoveAssetFile(this.getOptimizedAssetPath(assetId))
      this.assetActivePaths.delete(assetId)
      const message = error instanceof Error ? error.message : 'Failed to register GeoTIFF asset'
      this.updateProcessingStatus(jobId, {
        stage: 'error',
        progress: 100,
        message: 'Raster import failed',
        processingEngine: 'geotiff-js',
        error: message
      })
      throw error
    } finally {
      if (materializedInput) {
        await this.cleanupMaterializedInput(materializedInput)
      }
    }
  }

  async releaseGeoTiffAsset(assetId: string): Promise<void> {
    if (!isValidAssetId(assetId)) {
      return
    }

    this.assetActivePaths.delete(assetId)
    this.gdalTileRenderDisabledAssets.delete(assetId)
    this.clearTileCacheForAsset(assetId)

    const openContext = this.openAssetContexts.get(assetId)
    if (openContext) {
      try {
        openContext.tiff.close()
      } catch {
        // Ignore close errors during cleanup.
      } finally {
        this.openAssetContexts.delete(assetId)
      }
    }

    await this.removeAssetFileWithRetry(this.getOptimizedAssetPath(assetId))
    await this.removeAssetFileWithRetry(this.getAssetPath(assetId))
    await this.safeRemoveDirectory(this.getGdalTileCacheAssetPath(assetId))
  }

  getGeoTiffAssetStatus(jobId: string): GeoTiffAssetProcessingStatus | null {
    if (!isValidJobId(jobId)) {
      return null
    }

    const status = this.processingStatusByJobId.get(jobId)
    return status ? { ...status } : null
  }

  async renderTile(request: RasterTileRequest): Promise<Buffer> {
    this.validateTileRequest(request)

    const cacheKey = `${request.assetId}:${request.z}:${request.x}:${request.y}`
    const cached = this.getTileFromCache(cacheKey)
    if (cached) {
      return cached
    }

    const pending = this.pendingTiles.get(cacheKey)
    if (pending) {
      return pending
    }

    const renderPromise = this.withTileRenderSlot(
      async () => await this.renderTileInternal(request)
    )
      .then((tileBuffer) => {
        this.setTileCache(cacheKey, tileBuffer)
        return tileBuffer
      })
      .finally(() => {
        this.pendingTiles.delete(cacheKey)
      })

    this.pendingTiles.set(cacheKey, renderPromise)
    return renderPromise
  }

  async shutdown(): Promise<void> {
    for (const context of this.openAssetContexts.values()) {
      try {
        context.tiff.close()
      } catch {
        // Ignore close errors during shutdown.
      }
    }

    this.openAssetContexts.clear()
    this.assetActivePaths.clear()
    this.pendingOptimizationJobs.clear()
    this.gdalTileRenderDisabledAssets.clear()
    this.tileCache.clear()
    this.pendingTiles.clear()
    for (const timeoutHandle of this.processingStatusCleanupTimers.values()) {
      clearTimeout(timeoutHandle)
    }
    this.processingStatusCleanupTimers.clear()
    for (const timeoutHandle of this.staleContextCloseTimers) {
      clearTimeout(timeoutHandle)
    }
    this.staleContextCloseTimers.clear()
    while (this.tileRenderWaiters.length > 0) {
      const waiter = this.tileRenderWaiters.shift()
      waiter?.()
    }
    this.activeTileRenderCount = 0
    this.processingStatusByJobId.clear()
    this.decoderPool.destroy()
  }

  async cleanupOrphanedAssets(referencedAssetIds: Set<string>): Promise<number> {
    await this.ensureAssetsDirectory()
    const directoryEntries = await fs.readdir(this.getAssetsDirectoryPath(), {
      withFileTypes: true
    })

    let removedCount = 0
    const handledAssetIds = new Set<string>()
    for (const entry of directoryEntries) {
      if (!entry.isFile()) {
        continue
      }

      const match = /^([a-f0-9-]{36})(?:\.optimized)?\.tif$/i.exec(entry.name)
      if (!match) {
        continue
      }

      const assetId = match[1]
      if (handledAssetIds.has(assetId)) {
        continue
      }

      handledAssetIds.add(assetId)
      if (referencedAssetIds.has(assetId)) {
        continue
      }

      await this.releaseGeoTiffAsset(assetId)
      removedCount += 1
    }

    return removedCount
  }

  private async renderTileInternal(request: RasterTileRequest): Promise<Buffer> {
    const context = await this.getAssetContext(request.assetId)
    const mapTileBounds = tileToLonLatBounds(request.z, request.x, request.y)
    const sourceTileBounds = mapBoundsToSourceBounds(mapTileBounds, context.crs)
    const overlapBounds = intersection(sourceTileBounds, context.sourceBounds)

    if (!overlapBounds) {
      return this.transparentTilePng
    }

    const gdalTile = await this.tryRenderTileWithGdal(request, context, mapTileBounds)
    if (gdalTile) {
      return gdalTile
    }

    const targetRect = computeTileRect(sourceTileBounds, overlapBounds)
    if (targetRect.width <= 0 || targetRect.height <= 0) {
      return this.transparentTilePng
    }

    const level = this.selectBestLevel(context.levels, overlapBounds, targetRect.width)
    const readWindow = computeReadWindow(level, overlapBounds)
    if (!readWindow) {
      return this.transparentTilePng
    }

    const patchRgba =
      context.crs === 'EPSG:4326'
        ? await this.readWindowAsRgbaGeographic(
            request,
            context,
            level,
            readWindow,
            targetRect,
            mapTileBounds
          )
        : await this.readWindowAsRgba(context, level.image, readWindow, targetRect)
    const tileRgba = new Uint8Array(TILE_SIZE * TILE_SIZE * 4)
    blitRgbaPatch(tileRgba, patchRgba, targetRect)

    return Buffer.from(
      encodePng({
        width: TILE_SIZE,
        height: TILE_SIZE,
        data: tileRgba,
        channels: 4
      })
    )
  }

  private async tryRenderTileWithGdal(
    request: RasterTileRequest,
    context: RasterAssetContext,
    mapTileBounds: BoundingBox
  ): Promise<Buffer | null> {
    if (!this.shouldAttemptGdalTileRender(request.assetId, context.crs)) {
      return null
    }

    const availability = await this.gdalRunner.getAvailability()
    if (!availability.available) {
      return null
    }

    const tilePath = this.getGdalTileCachePath(request)
    try {
      const cachedTile = await fs.readFile(tilePath)
      if (cachedTile.length > 0) {
        return cachedTile
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        this.gdalTileRenderDisabledAssets.add(request.assetId)
        console.warn(`Disabling GDAL tile rendering for ${request.assetId}:`, error)
        return null
      }
    }

    const [minX, minY] = lonLatToWebMercator(mapTileBounds[0], mapTileBounds[1])
    const [maxX, maxY] = lonLatToWebMercator(mapTileBounds[2], mapTileBounds[3])
    const threadCount = resolveGdalTileThreadCount()
    const threadCountString = String(threadCount)

    try {
      await fs.mkdir(
        join(this.getGdalTileCacheAssetPath(request.assetId), `${request.z}`, `${request.x}`),
        {
          recursive: true
        }
      )
      await this.safeRemoveAssetFile(tilePath)

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
          context.filePath,
          tilePath
        ],
        { timeoutMs: GDAL_TILE_RENDER_TIMEOUT_MS }
      )

      const tileBuffer = await fs.readFile(tilePath)
      if (tileBuffer.length === 0) {
        return this.transparentTilePng
      }

      return tileBuffer
    } catch (error) {
      this.gdalTileRenderDisabledAssets.add(request.assetId)
      const message = error instanceof Error ? error.message : 'Unknown GDAL tile render failure'
      console.warn(
        `Disabling GDAL tile rendering for ${request.assetId} after tile render failure: ${message}`
      )
      await this.safeRemoveAssetFile(tilePath).catch(() => {})
      return null
    }
  }

  private shouldAttemptGdalTileRender(assetId: string, crs: SupportedRasterCrs): boolean {
    if (process.env.ARION_GDAL_TILE_RENDER === '0') {
      return false
    }

    if (crs !== 'EPSG:4326') {
      return false
    }

    return !this.gdalTileRenderDisabledAssets.has(assetId)
  }

  private async readWindowAsRgba(
    context: RasterAssetContext,
    image: GeoTIFFImage,
    readWindow: [number, number, number, number],
    targetRect: TileRect
  ): Promise<Uint8Array> {
    const { width, height } = targetRect

    try {
      const rgb = (await image.readRGB({
        window: readWindow,
        width,
        height,
        interleave: true,
        enableAlpha: true,
        resampleMethod: 'bilinear',
        pool: this.decoderPool
      })) as ReadRasterResult

      const rgbaFromRgb = normalizeReadRgbOutput(rgb, width, height)
      if (rgbaFromRgb) {
        return rgbaFromRgb
      }
    } catch {
      // Fall through to generic raster read for broader format support.
    }

    const rasters = (await image.readRasters({
      window: readWindow,
      width,
      height,
      interleave: false,
      fillValue: 0,
      resampleMethod: 'bilinear',
      pool: this.decoderPool
    })) as ReadRasterResult

    return normalizeReadRasterOutput(
      rasters,
      width,
      height,
      context.bandRanges,
      context.noDataValue
    )
  }

  private async readWindowAsRgbaGeographic(
    request: RasterTileRequest,
    context: RasterAssetContext,
    level: RasterImageLevel,
    readWindow: [number, number, number, number],
    targetRect: TileRect,
    mapTileBounds: BoundingBox
  ): Promise<Uint8Array> {
    const readWindowWidth = readWindow[2] - readWindow[0]
    const readWindowHeight = readWindow[3] - readWindow[1]

    const requestedWidth = Math.max(
      32,
      Math.min(1024, Math.max(targetRect.width * 2, Math.min(readWindowWidth, TILE_SIZE)))
    )
    const requestedHeight = Math.max(
      32,
      Math.min(1024, Math.max(targetRect.height * 2, Math.min(readWindowHeight, TILE_SIZE)))
    )

    const sampleWidth = Math.max(1, Math.min(readWindowWidth, requestedWidth))
    const sampleHeight = Math.max(1, Math.min(readWindowHeight, requestedHeight))

    const sampled = (await level.image.readRasters({
      window: readWindow,
      width: sampleWidth,
      height: sampleHeight,
      interleave: false,
      fillValue: 0,
      resampleMethod: 'bilinear',
      pool: this.decoderPool
    })) as ReadRasterResult

    const sampledBands = normalizeRasterBands(sampled)
    if (sampledBands.length === 0) {
      throw new Error('GeoTIFF decoder returned no raster bands for geographic warp')
    }

    const colorBands = sampledBands
      .slice(0, 3)
      .map((band, index) => scaleBandToUint8(band, context.bandRanges[index]))
    const nodataBand = sampledBands[0]

    const rgba = new Uint8Array(targetRect.width * targetRect.height * 4)
    const [west, , east] = mapTileBounds
    const lonSpan = east - west
    const levelSpanX = level.bounds[2] - level.bounds[0]
    const levelSpanY = level.bounds[3] - level.bounds[1]
    const sampleScaleX = sampleWidth / readWindowWidth
    const sampleScaleY = sampleHeight / readWindowHeight

    for (let row = 0; row < targetRect.height; row += 1) {
      const globalPixelY = targetRect.y + row + 0.5
      const latitude = latitudeForTilePixel(request.z, request.y, globalPixelY)

      for (let col = 0; col < targetRect.width; col += 1) {
        const globalPixelX = targetRect.x + col + 0.5
        const longitude = west + (globalPixelX / TILE_SIZE) * lonSpan
        const offset = (row * targetRect.width + col) * 4

        const sourceX = ((longitude - level.bounds[0]) / levelSpanX) * level.width
        const sourceY = ((level.bounds[3] - latitude) / levelSpanY) * level.height

        if (!Number.isFinite(sourceX) || !Number.isFinite(sourceY)) {
          rgba[offset + 3] = 0
          continue
        }

        const localSampleX = (sourceX - readWindow[0]) * sampleScaleX
        const localSampleY = (sourceY - readWindow[1]) * sampleScaleY

        if (
          localSampleX < 0 ||
          localSampleY < 0 ||
          localSampleX > sampleWidth - 1 ||
          localSampleY > sampleHeight - 1
        ) {
          rgba[offset + 3] = 0
          continue
        }

        const r = sampleBilinear(
          colorBands[0],
          sampleWidth,
          sampleHeight,
          localSampleX,
          localSampleY
        )
        const g = sampleBilinear(
          colorBands[1] ?? colorBands[0],
          sampleWidth,
          sampleHeight,
          localSampleX,
          localSampleY
        )
        const b = sampleBilinear(
          colorBands[2] ?? colorBands[0],
          sampleWidth,
          sampleHeight,
          localSampleX,
          localSampleY
        )

        const sampledNoData = sampleNearest(
          nodataBand,
          sampleWidth,
          sampleHeight,
          localSampleX,
          localSampleY
        )
        const alpha = isNoDataPixel(context.noDataValue, sampledNoData) ? 0 : 255

        rgba[offset] = toByte(r)
        rgba[offset + 1] = toByte(g)
        rgba[offset + 2] = toByte(b)
        rgba[offset + 3] = alpha
      }
    }

    return rgba
  }

  private selectBestLevel(
    levels: RasterImageLevel[],
    overlapBounds: BoundingBox,
    targetPixelWidth: number
  ): RasterImageLevel {
    const targetResolutionX = (overlapBounds[2] - overlapBounds[0]) / Math.max(1, targetPixelWidth)
    let bestLevel = levels[0]
    let bestScore = Number.POSITIVE_INFINITY

    for (const level of levels) {
      const levelResolutionX = (level.bounds[2] - level.bounds[0]) / level.width
      if (!Number.isFinite(levelResolutionX) || levelResolutionX <= 0) {
        continue
      }

      const score = Math.abs(Math.log2(levelResolutionX / targetResolutionX))
      if (score < bestScore) {
        bestScore = score
        bestLevel = level
      }
    }

    return bestLevel
  }

  private async getAssetContext(assetId: string): Promise<RasterAssetContext> {
    const existing = this.openAssetContexts.get(assetId)
    if (existing) {
      this.touchAssetContext(assetId, existing)
      return existing
    }

    const filePath = this.getActiveAssetPath(assetId)
    const context = await this.loadAssetContext(assetId, filePath)
    this.touchAssetContext(assetId, context)
    await this.enforceOpenAssetContextLimit(assetId)
    return context
  }

  private async loadAssetContext(assetId: string, filePath: string): Promise<RasterAssetContext> {
    const tiff = await geoTiffFromFile(filePath)

    try {
      const imageCount = await tiff.getImageCount()
      if (imageCount <= 0) {
        throw new Error('GeoTIFF has no readable image levels')
      }

      const levelCandidates: RasterImageLevelCandidate[] = []
      for (let index = 0; index < imageCount; index += 1) {
        const image = await tiff.getImage(index)

        levelCandidates.push({
          index,
          image,
          width: image.getWidth(),
          height: image.getHeight(),
          bounds: tryResolveImageLevelBounds(image, `GeoTIFF image level ${index}`)
        })
      }

      levelCandidates.sort((a, b) => b.width - a.width)
      const fallbackBoundsLevel = levelCandidates.find((level) => level.bounds !== null)
      if (!fallbackBoundsLevel?.bounds) {
        throw new Error(
          'GeoTIFF image levels are missing affine georeferencing metadata. Reproject to EPSG:4326 or EPSG:3857.'
        )
      }

      const fallbackBounds = validateBoundingBox(fallbackBoundsLevel.bounds, 'source')
      const levels: RasterImageLevel[] = levelCandidates.map((level) => ({
        index: level.index,
        image: level.image,
        width: level.width,
        height: level.height,
        bounds: level.bounds
          ? validateBoundingBox(level.bounds, `GeoTIFF image level ${level.index}`)
          : [...fallbackBounds]
      }))

      const baseLevel = levels[0]
      const crs = resolveSupportedCrs(baseLevel.image)
      const sourceBounds = validateBoundingBox(baseLevel.bounds, 'source')
      const mapBounds = validateBoundingBox(sourceBoundsToMapBounds(sourceBounds, crs), 'map')
      const width = baseLevel.width
      const height = baseLevel.height
      const bandCount = baseLevel.image.getSamplesPerPixel()
      const noDataValue = baseLevel.image.getGDALNoData()
      const bandRanges = await this.computeBandRanges(baseLevel.image, bandCount, noDataValue)
      const maxZoom = inferNativeMaxZoom(sourceBounds, width, crs)

      return {
        assetId,
        filePath,
        tiff,
        levels,
        crs,
        sourceBounds,
        mapBounds,
        width,
        height,
        bandCount,
        bandRanges,
        noDataValue,
        minZoom: 0,
        maxZoom
      }
    } catch (error) {
      try {
        tiff.close()
      } catch {
        // Ignore close errors if context creation failed.
      }
      throw error
    }
  }

  private startBackgroundOptimization(assetId: string, sourcePath: string, jobId: string): void {
    if (this.pendingOptimizationJobs.has(assetId)) {
      return
    }

    const optimizedPath = this.getOptimizedAssetPath(assetId)
    const optimizationJob = this.optimizeAssetInBackground(
      assetId,
      sourcePath,
      optimizedPath,
      jobId
    )
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : 'Background raster optimization failed'

        this.updateProcessingStatus(jobId, {
          assetId,
          stage: 'error',
          progress: 100,
          message: 'Raster optimization failed',
          processingEngine: 'geotiff-js',
          error: message
        })
      })
      .finally(() => {
        this.pendingOptimizationJobs.delete(assetId)
      })

    this.pendingOptimizationJobs.set(assetId, optimizationJob)
  }

  private async optimizeAssetInBackground(
    assetId: string,
    sourcePath: string,
    optimizedPath: string,
    jobId: string
  ): Promise<void> {
    const preprocessResult = await this.preprocessService.preprocessGeoTiff({
      assetId,
      inputPath: sourcePath,
      outputPath: optimizedPath,
      onProgress: (update) => {
        this.updateProcessingStatus(jobId, {
          assetId,
          stage: 'preprocessing',
          progress: clampToRange(update.progress, 38, 90),
          message: update.message,
          processingEngine: 'gdal'
        })
      }
    })

    if (!this.assetActivePaths.has(assetId)) {
      await this.safeRemoveAssetFile(optimizedPath)
      return
    }

    if (!preprocessResult.success) {
      const warning =
        preprocessResult.warning || 'GDAL optimization failed; continuing with fallback raster'

      if (this.shouldEnforceStrictGdal()) {
        console.error(
          `GDAL optimization failed for raster asset ${assetId} in strict mode: ${warning}`
        )
        this.updateProcessingStatus(jobId, {
          assetId,
          stage: 'error',
          progress: 100,
          message: 'GDAL optimization failed (strict mode)',
          processingEngine: 'geotiff-js',
          warning,
          error: warning
        })
        return
      }

      console.warn(`GDAL optimization fallback for raster asset ${assetId}: ${warning}`)
      this.updateProcessingStatus(jobId, {
        assetId,
        stage: 'ready',
        progress: 100,
        message: 'Raster ready (fallback pipeline)',
        processingEngine: 'geotiff-js',
        warning
      })
      return
    }

    this.updateProcessingStatus(jobId, {
      assetId,
      stage: 'loading',
      progress: 92,
      message: 'Applying optimized raster context',
      processingEngine: 'gdal',
      warning: preprocessResult.warning
    })

    let optimizedContext: RasterAssetContext | null = null

    try {
      optimizedContext = await this.loadAssetContext(assetId, optimizedPath)

      if (!this.assetActivePaths.has(assetId)) {
        return
      }

      this.assetActivePaths.set(assetId, optimizedPath)
      await this.replaceAssetContext(assetId, optimizedContext)
      this.clearTileCacheForAsset(assetId)
      setTimeout(() => {
        this.clearTileCacheForAsset(assetId)
      }, POST_SWAP_CACHE_CLEAR_DELAY_MS)

      this.updateProcessingStatus(jobId, {
        assetId,
        stage: 'ready',
        progress: 100,
        message: 'Raster ready (GDAL optimized)',
        processingEngine: 'gdal',
        warning: preprocessResult.warning
      })
    } catch (error) {
      if (optimizedContext) {
        this.scheduleStaleContextClose(optimizedContext)
      }

      const message = error instanceof Error ? error.message : 'Failed to apply optimized raster'
      if (this.shouldEnforceStrictGdal()) {
        console.error(`Failed to apply GDAL-optimized raster ${assetId} in strict mode: ${message}`)
        this.updateProcessingStatus(jobId, {
          assetId,
          stage: 'error',
          progress: 100,
          message: 'Failed to apply optimized raster (strict mode)',
          processingEngine: 'geotiff-js',
          warning: preprocessResult.warning,
          error: message
        })
        return
      }

      console.warn(`Failed to apply GDAL-optimized raster ${assetId}, using fallback: ${message}`)
      this.updateProcessingStatus(jobId, {
        assetId,
        stage: 'ready',
        progress: 100,
        message: 'Raster ready (fallback pipeline)',
        processingEngine: 'geotiff-js',
        warning: appendWarnings(preprocessResult.warning, message)
      })
    } finally {
      if (
        !this.assetActivePaths.has(assetId) ||
        this.assetActivePaths.get(assetId) !== optimizedPath
      ) {
        await this.safeRemoveAssetFile(optimizedPath)
      }
    }
  }

  private async replaceAssetContext(assetId: string, context: RasterAssetContext): Promise<void> {
    const previousContext = this.openAssetContexts.get(assetId)
    this.touchAssetContext(assetId, context)
    await this.enforceOpenAssetContextLimit(assetId)

    if (previousContext && previousContext !== context) {
      this.scheduleStaleContextClose(previousContext)
    }
  }

  private scheduleStaleContextClose(context: RasterAssetContext): void {
    const timeoutHandle = setTimeout(() => {
      try {
        context.tiff.close()
      } catch {
        // Ignore close errors for stale contexts.
      } finally {
        this.staleContextCloseTimers.delete(timeoutHandle)
      }
    }, STALE_CONTEXT_CLOSE_DELAY_MS)

    this.staleContextCloseTimers.add(timeoutHandle)
  }

  private shouldEnforceStrictGdal(): boolean {
    return app.isPackaged && process.env.ARION_ALLOW_GDAL_FALLBACK !== '1'
  }

  private resolveJobId(jobId?: string): string {
    if (typeof jobId === 'string' && isValidJobId(jobId)) {
      return jobId
    }

    return randomUUID()
  }

  private async materializeInput(
    request: RegisterGeoTiffAssetRequest,
    assetId: string
  ): Promise<MaterializedRasterInput> {
    if (request.filePath) {
      const sourcePath = resolve(request.filePath)
      await fs.access(sourcePath)
      return {
        path: sourcePath,
        cleanupDirectory: null
      }
    }

    if (request.fileBuffer) {
      const scratchDirectory = await fs.mkdtemp(join(tmpdir(), `arion-raster-input-${assetId}-`))
      const scratchFilePath = join(scratchDirectory, `${assetId}.tif`)
      await fs.writeFile(scratchFilePath, Buffer.from(request.fileBuffer))

      return {
        path: scratchFilePath,
        cleanupDirectory: scratchDirectory
      }
    }

    throw new Error('GeoTIFF registration requires either filePath or fileBuffer')
  }

  private async cleanupMaterializedInput(input: MaterializedRasterInput): Promise<void> {
    if (!input.cleanupDirectory) {
      return
    }

    await fs.rm(input.cleanupDirectory, { recursive: true, force: true })
  }

  private setProcessingStatus(status: GeoTiffAssetProcessingStatus): void {
    this.clearStatusCleanupTimer(status.jobId)
    this.processingStatusByJobId.set(status.jobId, status)
    if (isTerminalProcessingStage(status.stage)) {
      this.scheduleStatusCleanup(status.jobId)
    }
  }

  private updateProcessingStatus(
    jobId: string,
    updates: Partial<Omit<GeoTiffAssetProcessingStatus, 'jobId' | 'startedAt'>>
  ): void {
    const existing = this.processingStatusByJobId.get(jobId)
    if (!existing) {
      return
    }

    this.clearStatusCleanupTimer(jobId)
    const nextStatus = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    }
    this.processingStatusByJobId.set(jobId, nextStatus)
    if (isTerminalProcessingStage(nextStatus.stage)) {
      this.scheduleStatusCleanup(jobId)
    }
  }

  private scheduleStatusCleanup(jobId: string): void {
    this.clearStatusCleanupTimer(jobId)
    const timeoutHandle = setTimeout(() => {
      this.processingStatusByJobId.delete(jobId)
      this.processingStatusCleanupTimers.delete(jobId)
    }, PROCESSING_STATUS_TTL_MS)

    this.processingStatusCleanupTimers.set(jobId, timeoutHandle)
  }

  private clearStatusCleanupTimer(jobId: string): void {
    const timeoutHandle = this.processingStatusCleanupTimers.get(jobId)
    if (!timeoutHandle) {
      return
    }

    clearTimeout(timeoutHandle)
    this.processingStatusCleanupTimers.delete(jobId)
  }

  private async assertGeoTiffMagic(filePath: string): Promise<void> {
    const file = await fs.open(filePath, 'r')

    try {
      const header = Buffer.alloc(4)
      const { bytesRead } = await file.read(header, 0, 4, 0)
      if (bytesRead < 4 || !isGeoTiffMagic(header)) {
        throw new Error('File does not appear to be a valid TIFF/GeoTIFF')
      }
    } finally {
      await file.close()
    }
  }

  private async ensureAssetsDirectory(): Promise<void> {
    await fs.mkdir(this.getAssetsDirectoryPath(), { recursive: true })
  }

  private getAssetsDirectoryPath(): string {
    return join(app.getPath('userData'), RASTER_ASSETS_DIR)
  }

  private getGdalTileCacheDirectoryPath(): string {
    return join(this.getAssetsDirectoryPath(), GDAL_TILE_CACHE_DIR)
  }

  private getGdalTileCacheAssetPath(assetId: string): string {
    if (!isValidAssetId(assetId)) {
      throw new Error('Invalid raster asset id')
    }

    return join(this.getGdalTileCacheDirectoryPath(), assetId)
  }

  private getGdalTileCachePath(request: RasterTileRequest): string {
    return join(
      this.getGdalTileCacheAssetPath(request.assetId),
      `${request.z}`,
      `${request.x}`,
      `${request.y}.png`
    )
  }

  private getActiveAssetPath(assetId: string): string {
    return this.assetActivePaths.get(assetId) ?? this.getAssetPath(assetId)
  }

  private getAssetPath(assetId: string): string {
    if (!isValidAssetId(assetId)) {
      throw new Error('Invalid raster asset id')
    }

    return join(this.getAssetsDirectoryPath(), `${assetId}.tif`)
  }

  private getOptimizedAssetPath(assetId: string): string {
    if (!isValidAssetId(assetId)) {
      throw new Error('Invalid raster asset id')
    }

    return join(this.getAssetsDirectoryPath(), `${assetId}.optimized.tif`)
  }

  private createTransparentTile(): Buffer {
    const transparent = new Uint8Array(TILE_SIZE * TILE_SIZE * 4)
    return Buffer.from(
      encodePng({
        width: TILE_SIZE,
        height: TILE_SIZE,
        data: transparent,
        channels: 4
      })
    )
  }

  private getTileFromCache(cacheKey: string): Buffer | null {
    const entry = this.tileCache.get(cacheKey)
    if (!entry) {
      return null
    }

    this.tileCache.delete(cacheKey)
    this.tileCache.set(cacheKey, entry)
    return entry.data
  }

  private setTileCache(cacheKey: string, tileData: Buffer): void {
    this.tileCache.set(cacheKey, { data: tileData })

    if (this.tileCache.size <= TILE_CACHE_MAX_ENTRIES) {
      return
    }

    const oldestKey = this.tileCache.keys().next().value
    if (typeof oldestKey === 'string') {
      this.tileCache.delete(oldestKey)
    }
  }

  private clearTileCacheForAsset(assetId: string): void {
    for (const key of this.tileCache.keys()) {
      if (key.startsWith(`${assetId}:`)) {
        this.tileCache.delete(key)
      }
    }
  }

  private validateTileRequest(request: RasterTileRequest): void {
    if (!isValidAssetId(request.assetId)) {
      throw new Error('Invalid raster asset id')
    }

    if (!Number.isInteger(request.z) || request.z < 0 || request.z > 30) {
      throw new Error('Tile zoom is out of range')
    }

    const maxIndex = Math.pow(2, request.z) - 1
    if (!Number.isInteger(request.x) || request.x < 0 || request.x > maxIndex) {
      throw new Error('Tile X coordinate is out of range')
    }

    if (!Number.isInteger(request.y) || request.y < 0 || request.y > maxIndex) {
      throw new Error('Tile Y coordinate is out of range')
    }
  }

  private async computeBandRanges(
    image: GeoTIFFImage,
    bandCount: number,
    noDataValue: number | null
  ): Promise<BandRange[]> {
    const samplesToInspect = Math.max(1, Math.min(3, bandCount))
    const sampleIndexes = Array.from({ length: samplesToInspect }, (_, index) => index)
    const sampleWidth = Math.max(1, Math.min(1024, image.getWidth()))
    const sampleHeight = Math.max(1, Math.min(1024, image.getHeight()))

    const sampled = (await image.readRasters({
      samples: sampleIndexes,
      width: sampleWidth,
      height: sampleHeight,
      interleave: false,
      fillValue: 0,
      resampleMethod: 'bilinear',
      pool: this.decoderPool
    })) as ReadRasterResult

    const sampledBands = normalizeRasterBands(sampled)

    const ranges: BandRange[] = []
    for (let index = 0; index < samplesToInspect; index += 1) {
      const range = computeBandRange(sampledBands[index], noDataValue)
      ranges.push(range ?? { min: 0, max: 255 })
    }

    return ranges
  }

  private async withTileRenderSlot<T>(render: () => Promise<T>): Promise<T> {
    await this.acquireTileRenderSlot()
    try {
      return await render()
    } finally {
      this.releaseTileRenderSlot()
    }
  }

  private async acquireTileRenderSlot(): Promise<void> {
    if (this.activeTileRenderCount < MAX_CONCURRENT_TILE_RENDERS) {
      this.activeTileRenderCount += 1
      return
    }

    await new Promise<void>((resolve) => {
      this.tileRenderWaiters.push(() => {
        this.activeTileRenderCount += 1
        resolve()
      })
    })
  }

  private releaseTileRenderSlot(): void {
    this.activeTileRenderCount = Math.max(0, this.activeTileRenderCount - 1)
    const nextWaiter = this.tileRenderWaiters.shift()
    if (nextWaiter) {
      nextWaiter()
    }
  }

  private async safeRemoveAssetFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        throw error
      }
    }
  }

  private async safeRemoveDirectory(directoryPath: string): Promise<void> {
    try {
      await fs.rm(directoryPath, { recursive: true, force: true })
    } catch {
      // Ignore directory cleanup failures.
    }
  }

  private async removeAssetFileWithRetry(filePath: string): Promise<void> {
    try {
      await this.safeRemoveAssetFile(filePath)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY') {
        throw error
      }

      setTimeout(() => {
        void this.safeRemoveAssetFile(filePath).catch(() => {})
      }, STALE_CONTEXT_CLOSE_DELAY_MS)
    }
  }

  private touchAssetContext(assetId: string, context: RasterAssetContext): void {
    if (this.openAssetContexts.has(assetId)) {
      this.openAssetContexts.delete(assetId)
    }

    this.openAssetContexts.set(assetId, context)
  }

  private async enforceOpenAssetContextLimit(protectedAssetId: string): Promise<void> {
    while (this.openAssetContexts.size > MAX_OPEN_ASSET_CONTEXTS) {
      const oldestEntry = this.openAssetContexts.entries().next()
      if (oldestEntry.done) {
        return
      }

      const [oldestAssetId, oldestContext] = oldestEntry.value
      if (oldestAssetId === protectedAssetId) {
        return
      }

      this.openAssetContexts.delete(oldestAssetId)
      try {
        oldestContext.tiff.close()
      } catch {
        // Ignore close errors during cache eviction.
      }
    }
  }
}

function isGeoTiffMagic(header: Buffer): boolean {
  const littleEndianClassic =
    header[0] === 0x49 && header[1] === 0x49 && header[2] === 0x2a && header[3] === 0x00
  const bigEndianClassic =
    header[0] === 0x4d && header[1] === 0x4d && header[2] === 0x00 && header[3] === 0x2a
  const littleEndianBigTiff =
    header[0] === 0x49 && header[1] === 0x49 && header[2] === 0x2b && header[3] === 0x00
  const bigEndianBigTiff =
    header[0] === 0x4d && header[1] === 0x4d && header[2] === 0x00 && header[3] === 0x2b

  return littleEndianClassic || bigEndianClassic || littleEndianBigTiff || bigEndianBigTiff
}

function isValidAssetId(assetId: string): boolean {
  return VALID_ASSET_ID_PATTERN.test(assetId)
}

function isValidJobId(jobId: string): boolean {
  return VALID_JOB_ID_PATTERN.test(jobId)
}

function isTerminalProcessingStage(stage: GeoTiffAssetProcessingStatus['stage']): boolean {
  return stage === 'ready' || stage === 'error'
}

function appendWarnings(
  primary: string | undefined,
  secondary: string | undefined
): string | undefined {
  if (primary && secondary) {
    return `${primary}; ${secondary}`
  }

  return primary ?? secondary
}

function resolveGdalTileThreadCount(): number {
  const configured = Number(process.env.ARION_GDAL_TILE_THREADS)
  if (Number.isInteger(configured) && configured > 0 && configured <= 16) {
    return configured
  }

  return DEFAULT_GDAL_TILE_THREAD_COUNT
}

function tryResolveImageLevelBounds(image: GeoTIFFImage, context: string): BoundingBox | null {
  try {
    return validateBoundingBox(image.getBoundingBox() as BoundingBox, context)
  } catch (error) {
    if (isMissingAffineTransformationError(error)) {
      return null
    }

    throw error
  }
}

function isMissingAffineTransformationError(error: unknown): boolean {
  return error instanceof Error && /affine transformation/i.test(error.message)
}

function resolveSupportedCrs(image: GeoTIFFImage): SupportedRasterCrs {
  const geoKeys = (image.getGeoKeys?.() ?? {}) as Record<string, unknown>
  const projectedCode = normalizeGeoKeyCode(geoKeys['ProjectedCSTypeGeoKey'])
  if (projectedCode !== null) {
    if ([3857, 3785, 900913].includes(projectedCode)) {
      return 'EPSG:3857'
    }

    throw new Error(
      `Unsupported GeoTIFF projected CRS EPSG:${projectedCode}. Reproject to EPSG:4326 or EPSG:3857.`
    )
  }

  const geographicCode = normalizeGeoKeyCode(geoKeys['GeographicTypeGeoKey'])
  if (geographicCode !== null) {
    if ([4326, 4979].includes(geographicCode)) {
      return 'EPSG:4326'
    }

    throw new Error(
      `Unsupported GeoTIFF geographic CRS EPSG:${geographicCode}. Reproject to EPSG:4326 or EPSG:3857.`
    )
  }

  throw new Error('GeoTIFF is missing supported CRS metadata. Reproject to EPSG:4326 or EPSG:3857.')
}

function normalizeGeoKeyCode(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed
    }
  }

  return null
}

function computeTileRect(tileBounds: BoundingBox, overlapBounds: BoundingBox): TileRect {
  const tileWidth = tileBounds[2] - tileBounds[0]
  const tileHeight = tileBounds[3] - tileBounds[1]

  const startX = clampToTile(
    Math.floor(((overlapBounds[0] - tileBounds[0]) / tileWidth) * TILE_SIZE)
  )
  const endX = clampToTile(Math.ceil(((overlapBounds[2] - tileBounds[0]) / tileWidth) * TILE_SIZE))
  const startY = clampToTile(
    Math.floor(((tileBounds[3] - overlapBounds[3]) / tileHeight) * TILE_SIZE)
  )
  const endY = clampToTile(Math.ceil(((tileBounds[3] - overlapBounds[1]) / tileHeight) * TILE_SIZE))

  return {
    x: startX,
    y: startY,
    width: Math.max(0, endX - startX),
    height: Math.max(0, endY - startY)
  }
}

function computeReadWindow(
  level: RasterImageLevel,
  overlapBounds: BoundingBox
): [number, number, number, number] | null {
  const [minX, minY, maxX, maxY] = level.bounds
  const spanX = maxX - minX
  const spanY = maxY - minY

  if (spanX <= 0 || spanY <= 0) {
    return null
  }

  const left = clampToRange(
    Math.floor(((overlapBounds[0] - minX) / spanX) * level.width),
    0,
    level.width - 1
  )
  const right = clampToRange(
    Math.ceil(((overlapBounds[2] - minX) / spanX) * level.width),
    left + 1,
    level.width
  )
  const top = clampToRange(
    Math.floor(((maxY - overlapBounds[3]) / spanY) * level.height),
    0,
    level.height - 1
  )
  const bottom = clampToRange(
    Math.ceil(((maxY - overlapBounds[1]) / spanY) * level.height),
    top + 1,
    level.height
  )

  if (right <= left || bottom <= top) {
    return null
  }

  return [left, top, right, bottom]
}

function blitRgbaPatch(targetTile: Uint8Array, patch: Uint8Array, rect: TileRect): void {
  const { x, y, width, height } = rect

  for (let row = 0; row < height; row += 1) {
    const targetRowOffset = ((y + row) * TILE_SIZE + x) * 4
    const patchRowOffset = row * width * 4
    targetTile.set(patch.subarray(patchRowOffset, patchRowOffset + width * 4), targetRowOffset)
  }
}

function normalizeReadRgbOutput(
  data: ReadRasterResult,
  width: number,
  height: number
): Uint8Array | null {
  const pixelCount = width * height

  if (ArrayBuffer.isView(data)) {
    return normalizeInterleavedToRgba(data, pixelCount)
  }

  if (Array.isArray(data) && data.length > 0 && ArrayBuffer.isView(data[0])) {
    return normalizeInterleavedToRgba(data[0], pixelCount)
  }

  return null
}

function normalizeInterleavedToRgba(data: ArrayBufferView, pixelCount: number): Uint8Array | null {
  const values = data as unknown as ArrayLike<number>
  const rgba = new Uint8Array(pixelCount * 4)

  if (values.length === pixelCount * 4) {
    for (let i = 0; i < values.length; i += 1) {
      rgba[i] = toByte(values[i])
    }
    return rgba
  }

  if (values.length === pixelCount * 3) {
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const sourceOffset = pixel * 3
      const targetOffset = pixel * 4
      rgba[targetOffset] = toByte(values[sourceOffset])
      rgba[targetOffset + 1] = toByte(values[sourceOffset + 1])
      rgba[targetOffset + 2] = toByte(values[sourceOffset + 2])
      rgba[targetOffset + 3] = 255
    }
    return rgba
  }

  return null
}

function normalizeReadRasterOutput(
  data: ReadRasterResult,
  width: number,
  height: number,
  bandRanges: BandRange[],
  noDataValue: number | null
): Uint8Array {
  const pixelCount = width * height
  const bands = normalizeRasterBands(data)
  if (bands.length === 0) {
    throw new Error('GeoTIFF decoder returned no raster bands')
  }

  const scaledBands = bands
    .slice(0, 3)
    .map((band, bandIndex) => scaleBandToUint8(band, bandRanges[bandIndex]))
  const rgba = new Uint8Array(pixelCount * 4)

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const targetOffset = pixel * 4
    const r = scaledBands[0]?.[pixel] ?? 0
    const g = scaledBands[1]?.[pixel] ?? r
    const b = scaledBands[2]?.[pixel] ?? r

    rgba[targetOffset] = r
    rgba[targetOffset + 1] = g
    rgba[targetOffset + 2] = b

    const isNoData = isNoDataPixel(noDataValue, bands[0]?.[pixel])
    rgba[targetOffset + 3] = isNoData ? 0 : 255
  }

  return rgba
}

function normalizeRasterBands(data: ReadRasterResult): ArrayLike<number>[] {
  if (Array.isArray(data)) {
    const bands: ArrayLike<number>[] = []
    for (const entry of data) {
      if (ArrayBuffer.isView(entry)) {
        bands.push(entry as unknown as ArrayLike<number>)
      }
    }
    return bands
  }

  if (ArrayBuffer.isView(data)) {
    return [data as unknown as ArrayLike<number>]
  }

  return []
}

function scaleBandToUint8(data: ArrayLike<number>, range?: BandRange): Uint8Array {
  if (data instanceof Uint8Array && !range) {
    return data
  }

  let min = range?.min ?? Number.POSITIVE_INFINITY
  let max = range?.max ?? Number.NEGATIVE_INFINITY

  if (!range) {
    for (let i = 0; i < data.length; i += 1) {
      const value = data[i]
      if (!Number.isFinite(value)) {
        continue
      }

      if (value < min) min = value
      if (value > max) max = value
    }
  }

  const result = new Uint8Array(data.length)
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return result
  }

  const scale = 255 / (max - min)
  for (let i = 0; i < data.length; i += 1) {
    const value = data[i]
    if (!Number.isFinite(value)) {
      result[i] = 0
      continue
    }

    result[i] = toByte((value - min) * scale)
  }

  return result
}

function isNoDataPixel(noDataValue: number | null, value: number | undefined): boolean {
  if (noDataValue === null || value === undefined || !Number.isFinite(value)) {
    return false
  }

  return Math.abs(value - noDataValue) < 1e-9
}

function computeBandRange(
  data: ArrayLike<number> | undefined,
  noDataValue: number | null
): BandRange | null {
  if (!data || data.length === 0) {
    return null
  }

  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  for (let i = 0; i < data.length; i += 1) {
    const value = data[i]
    if (!Number.isFinite(value) || isNoDataPixel(noDataValue, value)) {
      continue
    }

    if (value < min) min = value
    if (value > max) max = value
  }

  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return null
  }

  return { min, max }
}

function toByte(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.min(255, Math.round(value)))
}

function latitudeForTilePixel(zoom: number, tileY: number, pixelYWithinTile: number): number {
  const n = Math.pow(2, zoom)
  const normalizedY = tileY + pixelYWithinTile / TILE_SIZE
  const mercatorY = Math.PI * (1 - (2 * normalizedY) / n)
  return (Math.atan(Math.sinh(mercatorY)) * 180) / Math.PI
}

function sampleBilinear(
  data: ArrayLike<number>,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  const x0 = clampToRange(Math.floor(x), 0, width - 1)
  const y0 = clampToRange(Math.floor(y), 0, height - 1)
  const x1 = clampToRange(x0 + 1, 0, width - 1)
  const y1 = clampToRange(y0 + 1, 0, height - 1)

  const fx = x - x0
  const fy = y - y0

  const v00 = data[y0 * width + x0] ?? 0
  const v10 = data[y0 * width + x1] ?? v00
  const v01 = data[y1 * width + x0] ?? v00
  const v11 = data[y1 * width + x1] ?? v01

  const top = v00 * (1 - fx) + v10 * fx
  const bottom = v01 * (1 - fx) + v11 * fx
  return top * (1 - fy) + bottom * fy
}

function sampleNearest(
  data: ArrayLike<number>,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  const sx = clampToRange(Math.round(x), 0, width - 1)
  const sy = clampToRange(Math.round(y), 0, height - 1)
  return data[sy * width + sx] ?? 0
}

function clampToTile(value: number): number {
  return clampToRange(value, 0, TILE_SIZE)
}

function clampToRange(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

let rasterTileService: RasterTileService | null = null

export function getRasterTileService(): RasterTileService {
  if (!rasterTileService) {
    rasterTileService = new RasterTileService()
  }

  return rasterTileService
}
