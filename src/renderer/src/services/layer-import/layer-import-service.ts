/**
 * Layer Import Service
 *
 * Main orchestrator for layer import functionality.
 * Coordinates validation, processing, and layer creation.
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  LayerCreateInput,
  LayerDefinition,
  ImportFormat
} from '../../../../shared/types/layer-types'
import type { GeoTiffAssetProcessingStatus } from '../../../../shared/ipc-types'
import { getRasterAssetId, getVectorAssetId } from '../../../../shared/lib/layer-asset-ids'
import { LayerImportValidator, type ValidationResult } from './layer-import-validator'
import { GeoJSONProcessor } from './processors/geojson-processor'
import {
  GeopackageProcessor,
  type GeoPackageImportProgressStatus
} from './processors/geopackage-processor'
import {
  ShapefileProcessor,
  type ShapefileImportProgressStatus
} from './processors/shapefile-processor'
import { RasterProcessor } from './processors/raster-processor'
import { resolveLocalImportFilePath } from './processors/local-import-file-path'

export interface ImportResult {
  success: boolean
  layerIds: string[]
  errors: string[]
  warnings: string[]
}

export interface LayerProcessOptions {
  onRasterProgress?: (status: GeoTiffAssetProcessingStatus) => void
  onGeoPackageProgress?: (status: GeoPackageImportProgressStatus) => void
  onShapefileProgress?: (status: ShapefileImportProgressStatus) => void
}

export class LayerImportService {
  private static readonly STATUS_POLL_INTERVAL_MS = 300
  private static readonly BACKGROUND_STATUS_POLL_MAX_MS = 20 * 60 * 1000

  /**
   * Validate if file is supported for import
   */
  static validateFile(file: File): ValidationResult {
    return LayerImportValidator.validateFile(file)
  }

  /**
   * Process file and create layer definition
   */
  static async processFile(
    file: File,
    format: ImportFormat,
    options?: LayerProcessOptions
  ): Promise<LayerDefinition> {
    const fileName = file.name.replace(/\.[^/.]+$/, '') // Remove extension

    try {
      const sourcePath = await resolveLocalImportFilePath(file)
      if (!sourcePath) {
        throw new Error(this.getMissingLocalPathMessage(format))
      }

      switch (format) {
        case 'geojson':
          return await this.importFromLocalPath(sourcePath, fileName)

        case 'shapefile':
          options?.onShapefileProgress?.({
            stage: 'resolving',
            progress: 12,
            message: 'Resolving local shapefile path'
          })
          options?.onShapefileProgress?.({
            stage: 'importing',
            progress: 45,
            message: sourcePath.toLowerCase().endsWith('.shp')
              ? 'Loading shapefile dataset from disk'
              : 'Loading shapefile archive from disk'
          })
          return await this.importManagedVectorWithProgress(sourcePath, fileName, {
            onFinalizing: (layer) =>
              options?.onShapefileProgress?.({
                stage: 'finalizing',
                progress: 88,
                message: this.buildFinalizingMessage(layer)
              })
          })

        case 'geopackage':
          options?.onGeoPackageProgress?.({
            stage: 'resolving',
            progress: 12,
            message: 'Resolving local GeoPackage path'
          })
          options?.onGeoPackageProgress?.({
            stage: 'importing',
            progress: 45,
            message: 'Converting GeoPackage into a managed vector asset'
          })
          return await this.importManagedVectorWithProgress(sourcePath, fileName, {
            onFinalizing: (layer) =>
              options?.onGeoPackageProgress?.({
                stage: 'finalizing',
                progress: 88,
                message: this.buildFinalizingMessage(layer)
              })
          })

        case 'geotiff':
          return await this.importGeoTiffFromLocalPath(
            sourcePath,
            fileName,
            options?.onRasterProgress
          )

        default:
          throw new Error(`Processing for ${format} format not yet implemented`)
      }
    } catch (error) {
      throw new Error(
        `Failed to process ${format} file: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  private static async importManagedVectorWithProgress(
    sourcePath: string,
    layerName: string,
    options: {
      onFinalizing?: (layer: LayerDefinition) => void
    } = {}
  ): Promise<LayerDefinition> {
    const layer = await this.importFromLocalPath(sourcePath, layerName)
    options.onFinalizing?.(layer)
    return layer
  }

  private static async importFromLocalPath(
    sourcePath: string,
    layerName: string,
    request: {
      geotiffJobId?: string
    } = {}
  ): Promise<LayerDefinition> {
    const layerInput = await window.ctg.layers.importLocalLayer({
      sourcePath,
      layerName,
      ...(request.geotiffJobId ? { geotiffJobId: request.geotiffJobId } : {})
    })

    return this.materializeLayerDefinition(layerInput)
  }

  private static async importGeoTiffFromLocalPath(
    sourcePath: string,
    layerName: string,
    onProgress?: (status: GeoTiffAssetProcessingStatus) => void
  ): Promise<LayerDefinition> {
    const jobId = uuidv4()
    let shouldStopPolling = false
    const emitProgress = this.createProgressEmitter(onProgress)
    const pollingPromise = this.pollGeoTiffAssetStatus(jobId, emitProgress, () => shouldStopPolling)

    try {
      const layer = await this.importFromLocalPath(sourcePath, layerName, { geotiffJobId: jobId })
      await this.emitLatestStatus(jobId, emitProgress)
      void this.pollGeoTiffAssetStatusUntilTerminal(
        jobId,
        emitProgress,
        this.BACKGROUND_STATUS_POLL_MAX_MS
      )
      return layer
    } finally {
      shouldStopPolling = true
      await pollingPromise
    }
  }

  private static materializeLayerDefinition(layerInput: LayerCreateInput): LayerDefinition {
    const now = new Date()
    return {
      ...layerInput,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now
    }
  }

  private static buildFinalizingMessage(layer: LayerDefinition): string {
    const featureCount = layer.metadata.featureCount
    if (typeof featureCount === 'number' && Number.isFinite(featureCount)) {
      return `Preparing ${featureCount.toLocaleString()} imported features`
    }

    return 'Preparing imported features'
  }

  private static getMissingLocalPathMessage(format: ImportFormat): string {
    switch (format) {
      case 'geopackage':
        return 'GeoPackage import requires a local file path. Re-select the file and try again.'
      case 'geotiff':
        return 'GeoTIFF import requires a local file path. Re-select the file and try again.'
      case 'shapefile':
        return 'Shapefile import requires a local file path. Re-select the file and try again.'
      case 'geojson':
        return 'GeoJSON import requires a local file path. Re-select the file and try again.'
      default:
        return 'Layer import requires a local file path. Re-select the file and try again.'
    }
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

  /**
   * Import multiple files with validation and error handling
   */
  static async importFiles(files: File[]): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      layerIds: [],
      errors: [],
      warnings: []
    }

    for (const file of files) {
      try {
        // Validate file
        const validation = this.validateFile(file)
        if (!validation.valid) {
          result.errors.push(`${file.name}: ${validation.error}`)
          result.success = false
          continue
        }

        // Process file
        const layerDefinition = await this.processFile(file, validation.format!)
        result.layerIds.push(layerDefinition.id)

        // Add any format-specific warnings
        const warnings = this.getFormatWarnings(file, validation.format!)
        result.warnings.push(...warnings)
      } catch (error) {
        result.errors.push(
          `${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
        result.success = false
      }
    }

    return result
  }

  /**
   * Get format-specific warnings
   */
  private static getFormatWarnings(file: File, format: ImportFormat): string[] {
    // These lightweight, renderer-side checks are only for pre-import guidance.
    // Actual layer import is delegated to the main-process importer above.
    const warnings: string[] = []

    switch (format) {
      case 'geotiff': {
        const rasterRecommendations = RasterProcessor.getProcessingRecommendations(file)
        warnings.push(...rasterRecommendations.warnings.map((w) => `${file.name}: ${w}`))
        break
      }

      case 'shapefile':
        // Add shapefile-specific warnings if needed
        break

      case 'geopackage':
        // Add GeoPackage-specific warnings if needed
        break

      case 'geojson':
        // Add GeoJSON-specific warnings if needed
        break
    }

    return warnings
  }

  /**
   * Get detailed information about a file before import
   */
  static async analyzeFile(file: File): Promise<{
    fileName: string
    fileSize: string
    format?: ImportFormat
    isValid: boolean
    error?: string
    details?: unknown
  }> {
    const validation = this.validateFile(file)
    const fileSize = this.formatFileSize(file.size)

    const analysis = {
      fileName: file.name,
      fileSize,
      format: validation.format,
      isValid: validation.valid,
      error: validation.error
    }

    if (!validation.valid || !validation.format) {
      return analysis
    }

    // Use renderer-side analyzers for preview details only.
    // The authoritative import path remains `importLocalLayer` in the main process.
    try {
      let details: unknown = {}

      switch (validation.format) {
        case 'geojson': {
          const text = await file.text()
          const geoJsonData = JSON.parse(text)
          details = GeoJSONProcessor.getSummaryInfo(geoJsonData)
          break
        }

        case 'shapefile':
          details = await ShapefileProcessor.analyzeShapefileContents(file)
          break

        case 'geopackage':
          details = await GeopackageProcessor.analyzeFile(file)
          break

        case 'geotiff':
          details = RasterProcessor.getProcessingRecommendations(file)
          break
      }

      return { ...analysis, details }
    } catch (error) {
      return {
        ...analysis,
        error: `Failed to analyze file: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  /**
   * Format file size in human-readable format
   */
  private static formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  /**
   * Clean up resources for imported layers (e.g., blob URLs)
   */
  static async cleanupLayer(layerDefinition: LayerDefinition): Promise<void> {
    if (
      layerDefinition.type === 'raster' &&
      typeof layerDefinition.sourceConfig.data === 'string'
    ) {
      RasterProcessor.cleanupBlobUrl(layerDefinition.sourceConfig.data)
    }

    const rasterAssetId = getRasterAssetId(layerDefinition)
    if (rasterAssetId) {
      await RasterProcessor.cleanupRasterAsset(rasterAssetId)
    }

    const vectorAssetId = getVectorAssetId(layerDefinition)
    if (vectorAssetId) {
      await window.ctg.layers.releaseVectorAsset(vectorAssetId)
    }
  }
}

// Re-export commonly used types and constants
export {
  LAYER_IMPORT_ACCEPT_ATTRIBUTE,
  SUPPORTED_FORMATS,
  SUPPORTED_LAYER_IMPORT_DESCRIPTION,
  type SupportedMimeType,
  type SupportedFormat
} from './layer-import-validator'
export type { ValidationResult } from './layer-import-validator'
