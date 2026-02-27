/**
 * Raster Processor
 *
 * Handles processing of raster files (GeoTIFF, images) for layer import.
 * Creates blob URLs and layer definitions for raster data.
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  GeoTiffAssetProcessingStatus,
  RegisterGeoTiffAssetResult
} from '../../../../../shared/ipc-types'
import type {
  LayerDefinition,
  LayerType,
  LayerSourceConfig
} from '../../../../../shared/types/layer-types'
import { RasterMetadataExtractor } from '../metadata/raster-metadata-extractor'
import { LayerStyleFactory } from '../styles/layer-style-factory'

export class RasterProcessor {
  private static readonly STATUS_POLL_INTERVAL_MS = 300
  private static readonly BACKGROUND_STATUS_POLL_MAX_MS = 20 * 60 * 1000

  /**
   * Process raster file and create layer definition
   */
  static async processFile(
    file: File,
    fileName: string,
    onProgress?: (status: GeoTiffAssetProcessingStatus) => void
  ): Promise<LayerDefinition> {
    let geotiffAssetId: string | null = null

    try {
      // Validate the raster file first
      const validation = RasterMetadataExtractor.validateRasterFile(file)
      if (!validation.valid) {
        throw new Error(validation.error)
      }

      const fileInfo = RasterMetadataExtractor.getFileTypeInfo(file)
      const sourceFilePath = this.getElectronFilePath(file)
      let sourceConfig: LayerSourceConfig
      let bounds: [number, number, number, number] | undefined
      let geotiffAsset: RegisterGeoTiffAssetResult | null = null

      // Use tiled protocol-backed rendering for GeoTIFF files.
      if (fileInfo.isGeoTIFF) {
        geotiffAsset = await this.registerGeoTiffAsset(file, onProgress)
        geotiffAssetId = geotiffAsset.assetId
        bounds = geotiffAsset.bounds

        sourceConfig = {
          type: 'raster',
          data: geotiffAsset.tilesUrlTemplate,
          options: {
            tileSize: 256,
            minZoom: geotiffAsset.minZoom,
            maxZoom: geotiffAsset.maxZoom,
            bounds: geotiffAsset.bounds,
            rasterAssetId: geotiffAsset.assetId,
            rasterSourcePath: sourceFilePath || undefined
          }
        } as LayerSourceConfig
      } else {
        const blobUrl = URL.createObjectURL(file)
        sourceConfig = {
          type: 'image',
          data: blobUrl
        } as LayerSourceConfig
      }

      // Extract metadata
      const metadata = RasterMetadataExtractor.extractEnhancedMetadata(file, fileName)

      // Add bounds to metadata for zoom-to-layer functionality
      if (bounds) {
        metadata.bounds = bounds
      }

      if (geotiffAsset) {
        metadata.crs = geotiffAsset.crs
        metadata.tags = Array.from(
          new Set([...(metadata.tags || []), 'tiled', geotiffAsset.processingEngine])
        )

        if (geotiffAsset.processingWarning) {
          metadata.tags = Array.from(new Set([...(metadata.tags || []), 'raster-warning']))
          metadata.description = [metadata.description, `Note: ${geotiffAsset.processingWarning}`]
            .filter(Boolean)
            .join(' ')
        }
      }

      // Create default raster style
      const style = LayerStyleFactory.createRasterStyle()

      return {
        id: uuidv4(),
        name: fileName,
        type: 'raster' as LayerType,
        sourceId: `source-${uuidv4()}`,
        sourceConfig,
        style,
        visibility: true,
        opacity: 1.0,
        zIndex: 0,
        metadata,
        isLocked: false,
        createdBy: 'import' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    } catch (error) {
      if (geotiffAssetId) {
        try {
          await this.cleanupRasterAsset(geotiffAssetId)
        } catch {
          // Ignore cleanup failures and surface the import error.
        }
      }

      throw new Error(
        `Failed to process raster file: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Validate raster file before processing
   */
  static validateFile(file: File): { valid: boolean; error?: string } {
    return RasterMetadataExtractor.validateRasterFile(file)
  }

  /**
   * Get file type information
   */
  static getFileInfo(file: File): {
    mimeType: string
    extension: string
    isGeoTIFF: boolean
    isPotentiallyGeoreferenced: boolean
  } {
    return RasterMetadataExtractor.getFileTypeInfo(file)
  }

  /**
   * Check if file is a supported raster format
   */
  static isSupportedRasterFormat(file: File): boolean {
    const fileInfo = this.getFileInfo(file)
    const supportedExtensions = ['tif', 'tiff']
    return supportedExtensions.includes(fileInfo.extension)
  }

  /**
   * Estimate processing complexity based on file size (informational only)
   */
  static getProcessingComplexity(file: File): 'low' | 'medium' | 'high' {
    const sizeMB = file.size / (1024 * 1024)

    if (sizeMB < 10) return 'low'
    if (sizeMB < 100) return 'medium'
    return 'high'
  }

  /**
   * Clean up blob URL when layer is removed
   */
  static cleanupBlobUrl(blobUrl: string): void {
    if (blobUrl.startsWith('blob:')) {
      URL.revokeObjectURL(blobUrl)
    }
  }

  static async cleanupRasterAsset(assetId: string): Promise<void> {
    if (!assetId) {
      return
    }

    await window.ctg.layers.releaseGeoTiffAsset(assetId)
  }

  /**
   * Check if file might be georeferenced
   */
  static isLikelyGeoreferenced(file: File): boolean {
    const fileInfo = this.getFileInfo(file)
    return fileInfo.isPotentiallyGeoreferenced
  }

  /**
   * Get processing recommendations for the file
   */
  static getProcessingRecommendations(file: File): {
    complexity: 'low' | 'medium' | 'high'
    warnings: string[]
    suggestions: string[]
  } {
    const complexity = this.getProcessingComplexity(file)
    const fileInfo = this.getFileInfo(file)
    const warnings: string[] = []
    const suggestions: string[] = []

    if (complexity === 'high') {
      suggestions.push('Large files are streamed and tiled at render time for better stability')
    }

    if (!fileInfo.isGeoTIFF) {
      warnings.push('Non-GeoTIFF files may lack spatial reference information')
      suggestions.push('Ensure the image has proper georeferencing')
    }

    return { complexity, warnings, suggestions }
  }

  private static async registerGeoTiffAsset(
    file: File,
    onProgress?: (status: GeoTiffAssetProcessingStatus) => void
  ): Promise<RegisterGeoTiffAssetResult> {
    const jobId = uuidv4()
    let shouldStopPolling = false
    const emitProgress = this.createProgressEmitter(onProgress)

    const pollingPromise = this.pollGeoTiffAssetStatus(jobId, emitProgress, () => shouldStopPolling)

    const filePath = this.getElectronFilePath(file)
    const requestBase = {
      fileName: file.name,
      jobId
    }

    try {
      let result: RegisterGeoTiffAssetResult
      if (filePath) {
        result = await window.ctg.layers.registerGeoTiffAsset({
          ...requestBase,
          filePath
        })
      } else {
        const fileBuffer = await file.arrayBuffer()
        result = await window.ctg.layers.registerGeoTiffAsset({
          ...requestBase,
          fileBuffer
        })
      }

      await this.emitLatestStatus(jobId, emitProgress)
      void this.pollGeoTiffAssetStatusUntilTerminal(
        jobId,
        emitProgress,
        this.BACKGROUND_STATUS_POLL_MAX_MS
      )
      return result
    } finally {
      shouldStopPolling = true
      await pollingPromise
    }
  }

  private static getElectronFilePath(file: File): string | null {
    const fileWithPath = file as File & { path?: string }
    if (typeof fileWithPath.path === 'string' && fileWithPath.path.trim().length > 0) {
      return fileWithPath.path
    }

    return null
  }

  private static async pollGeoTiffAssetStatus(
    jobId: string,
    emitProgress: ((status: GeoTiffAssetProcessingStatus) => void) | null,
    shouldStop: () => boolean
  ): Promise<void> {
    if (!emitProgress) {
      return
    }

    while (!shouldStop()) {
      const status = await this.fetchStatus(jobId)
      if (status) {
        emitProgress(status)

        if (status.stage === 'ready' || status.stage === 'error') {
          return
        }
      }

      await this.delay(this.STATUS_POLL_INTERVAL_MS)
    }
  }

  private static async emitLatestStatus(
    jobId: string,
    emitProgress: ((status: GeoTiffAssetProcessingStatus) => void) | null
  ): Promise<void> {
    if (!emitProgress) {
      return
    }

    const status = await this.fetchStatus(jobId)
    if (status) {
      emitProgress(status)
    }
  }

  private static async pollGeoTiffAssetStatusUntilTerminal(
    jobId: string,
    emitProgress: ((status: GeoTiffAssetProcessingStatus) => void) | null,
    maxDurationMs: number
  ): Promise<void> {
    if (!emitProgress) {
      return
    }

    const startedAt = Date.now()
    while (Date.now() - startedAt < maxDurationMs) {
      const status = await this.fetchStatus(jobId)
      if (status) {
        emitProgress(status)
        if (status.stage === 'ready' || status.stage === 'error') {
          return
        }
      }

      await this.delay(this.STATUS_POLL_INTERVAL_MS)
    }
  }

  private static async fetchStatus(jobId: string): Promise<GeoTiffAssetProcessingStatus | null> {
    try {
      return await window.ctg.layers.getGeoTiffAssetStatus(jobId)
    } catch {
      return null
    }
  }

  private static statusSignature(status: GeoTiffAssetProcessingStatus): string {
    return `${status.stage}|${status.progress}|${status.message}|${status.error ?? ''}`
  }

  private static createProgressEmitter(
    onProgress: ((status: GeoTiffAssetProcessingStatus) => void) | undefined
  ): ((status: GeoTiffAssetProcessingStatus) => void) | null {
    if (!onProgress) {
      return null
    }

    let lastSignature = ''
    return (status) => {
      const signature = this.statusSignature(status)
      if (signature === lastSignature) {
        return
      }

      lastSignature = signature
      onProgress(status)
    }
  }

  private static async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }
}
