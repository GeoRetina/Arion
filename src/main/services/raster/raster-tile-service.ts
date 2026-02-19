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
  mapBoundsToSourceBounds,
  sourceBoundsToMapBounds,
  tileToLonLatBounds,
  TILE_SIZE,
  validateBoundingBox
} from './raster-coordinate-utils'
import { getRasterGdalTileService } from './raster-gdal-tile-service'
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
const MAX_CONCURRENT_TILE_RENDERS = Math.max(1, Math.min(4, cpus().length - 1))
const BAND_RANGE_PERCENTILE_LOW = 0.02
const BAND_RANGE_PERCENTILE_HIGH = 0.98
const BAND_RANGE_MAX_SAMPLE_VALUES = 131_072

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
  paletteIndexed: boolean
  sourceByteLike: boolean
  noDataValue: number | null
  minZoom: number
  maxZoom: number
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
  private readonly gdalTileService = getRasterGdalTileService()
  private readonly preprocessService = getRasterGdalPreprocessService()
  private readonly openAssetContexts = new Map<string, RasterAssetContext>()
  private readonly assetActivePaths = new Map<string, string>()
  private readonly tileCache = new Map<string, CachedTileEntry>()
  private readonly pendingTiles = new Map<string, Promise<Buffer>>()
  private readonly processingStatusByJobId = new Map<string, GeoTiffAssetProcessingStatus>()
  private readonly processingStatusCleanupTimers = new Map<string, NodeJS.Timeout>()
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
    await this.gdalTileService.ensureTileRenderingAvailable()

    const assetId = randomUUID()
    const destinationPath = this.getAssetPath(assetId)
    const optimizedPath = this.getOptimizedAssetPath(assetId)
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
        stage: 'preparing',
        progress: 20,
        message: 'Staging raster source'
      })
      await fs.copyFile(materializedInput.path, destinationPath)

      this.updateProcessingStatus(jobId, {
        stage: 'preprocessing',
        progress: 24,
        message: 'Optimizing raster with GDAL',
        processingEngine: 'gdal'
      })

      const preprocessResult = await this.preprocessService.preprocessGeoTiff({
        assetId,
        inputPath: destinationPath,
        outputPath: optimizedPath,
        onProgress: (update) => {
          this.updateProcessingStatus(jobId, {
            stage: 'preprocessing',
            progress: clampToRange(update.progress, 24, 90),
            message: update.message,
            processingEngine: 'gdal'
          })
        }
      })

      if (!preprocessResult.success) {
        throw new Error(
          preprocessResult.warning || 'GDAL optimization failed and no fallback pipeline is enabled'
        )
      }

      this.updateProcessingStatus(jobId, {
        stage: 'loading',
        progress: 92,
        message: 'Loading optimized raster context',
        processingEngine: 'gdal',
        warning: preprocessResult.warning
      })
      const context = await this.loadAssetContext(assetId, optimizedPath)
      this.assetActivePaths.set(assetId, optimizedPath)
      this.touchAssetContext(assetId, context)
      await this.enforceOpenAssetContextLimit(assetId)

      this.updateProcessingStatus(jobId, {
        assetId,
        stage: 'ready',
        progress: 100,
        message: 'Raster ready (GDAL optimized)',
        processingEngine: 'gdal',
        warning: preprocessResult.warning
      })

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
        processingEngine: 'gdal',
        processingWarning: preprocessResult.warning
      }
    } catch (error) {
      await this.safeRemoveAssetFile(destinationPath)
      await this.safeRemoveAssetFile(optimizedPath)
      this.assetActivePaths.delete(assetId)
      const message = error instanceof Error ? error.message : 'Failed to register GeoTIFF asset'
      this.updateProcessingStatus(jobId, {
        stage: 'error',
        progress: 100,
        message: 'Raster import failed',
        processingEngine: 'gdal',
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
    await this.gdalTileService.releaseAsset(assetId)
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
    this.gdalTileService.shutdown()
    this.tileCache.clear()
    this.pendingTiles.clear()
    for (const timeoutHandle of this.processingStatusCleanupTimers.values()) {
      clearTimeout(timeoutHandle)
    }
    this.processingStatusCleanupTimers.clear()
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

    return await this.gdalTileService.renderTile({
      assetId: request.assetId,
      z: request.z,
      x: request.x,
      y: request.y,
      bandCount: context.bandCount,
      bandRanges: context.bandRanges,
      paletteIndexed: context.paletteIndexed,
      sourceByteLike: context.sourceByteLike,
      crs: context.crs,
      mapBounds: mapTileBounds,
      sourceFilePath: context.filePath,
      transparentTilePng: this.transparentTilePng
    })
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
      const paletteIndexed = isPaletteIndexedImage(baseLevel.image)
      const sourceByteLike = isByteLikeImage(baseLevel.image)
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
        paletteIndexed,
        sourceByteLike,
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

function isPaletteIndexedImage(image: GeoTIFFImage): boolean {
  const fileDirectory = readImageFileDirectory(image)
  if (!fileDirectory) {
    return false
  }

  const photometricInterpretation = readNumericTagValue(fileDirectory, 'PhotometricInterpretation')
  if (photometricInterpretation === 3) {
    return true
  }

  const colorMap = fileDirectory['ColorMap']
  return Array.isArray(colorMap) || ArrayBuffer.isView(colorMap)
}

function isByteLikeImage(image: GeoTIFFImage): boolean {
  const fileDirectory = readImageFileDirectory(image)
  if (!fileDirectory) {
    return false
  }

  const bitsPerSample = readNumericTagValues(fileDirectory, 'BitsPerSample')
  if (bitsPerSample.length === 0 || bitsPerSample.some((bits) => bits > 8 || bits <= 0)) {
    return false
  }

  const sampleFormats = readNumericTagValues(fileDirectory, 'SampleFormat')
  if (sampleFormats.length === 0) {
    return true
  }

  return sampleFormats.every((sampleFormat) => sampleFormat === 1)
}

function readImageFileDirectory(image: GeoTIFFImage): Record<string, unknown> | null {
  const candidate = (image as unknown as { fileDirectory?: unknown }).fileDirectory
  if (!candidate || typeof candidate !== 'object') {
    return null
  }

  return candidate as Record<string, unknown>
}

function readNumericTagValues(fileDirectory: Record<string, unknown>, tagName: string): number[] {
  const value = fileDirectory[tagName]
  if (typeof value === 'number' && Number.isFinite(value)) {
    return [value]
  }

  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is number => typeof entry === 'number' && Number.isFinite(entry)
    )
  }

  if (ArrayBuffer.isView(value) && hasArrayLength(value)) {
    const arrayLike = value as unknown as ArrayLike<unknown>
    const values: number[] = []
    for (let index = 0; index < arrayLike.length; index += 1) {
      const sample = Number(arrayLike[index])
      if (Number.isFinite(sample)) {
        values.push(sample)
      }
    }
    return values
  }

  return []
}

function readNumericTagValue(
  fileDirectory: Record<string, unknown>,
  tagName: string
): number | null {
  const values = readNumericTagValues(fileDirectory, tagName)
  return values.length > 0 ? values[0] : null
}

function hasArrayLength(value: ArrayBufferView): value is ArrayBufferView & { length: number } {
  const withLength = value as ArrayBufferView & { length?: unknown }
  return typeof withLength.length === 'number'
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
  let validCount = 0
  const samplingStep = Math.max(1, Math.floor(data.length / BAND_RANGE_MAX_SAMPLE_VALUES))
  const sampledValues: number[] = []

  for (let i = 0; i < data.length; i += 1) {
    const value = data[i]
    if (!Number.isFinite(value) || isNoDataPixel(noDataValue, value)) {
      continue
    }

    if (value < min) min = value
    if (value > max) max = value

    if (validCount % samplingStep === 0) {
      sampledValues.push(value)
    }
    validCount += 1
  }

  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return null
  }

  const robustRange = computePercentileRange(sampledValues)
  if (robustRange && robustRange.max > robustRange.min) {
    return robustRange
  }

  return { min, max }
}

function computePercentileRange(values: number[]): BandRange | null {
  if (values.length < 64) {
    return null
  }

  values.sort((left, right) => left - right)
  const low = pickPercentile(values, BAND_RANGE_PERCENTILE_LOW)
  const high = pickPercentile(values, BAND_RANGE_PERCENTILE_HIGH)

  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) {
    return null
  }

  return { min: low, max: high }
}

function pickPercentile(values: number[], percentile: number): number {
  if (values.length === 0) {
    return Number.NaN
  }

  const clampedPercentile = Math.max(0, Math.min(1, percentile))
  const index = Math.floor((values.length - 1) * clampedPercentile)
  return values[index]
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

export const __testing = {
  isPaletteIndexedImage,
  isByteLikeImage,
  readNumericTagValues,
  computeBandRange,
  computePercentileRange,
  pickPercentile
}
