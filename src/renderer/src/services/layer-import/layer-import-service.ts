/**
 * Layer Import Service
 * 
 * Main orchestrator for layer import functionality.
 * Coordinates validation, processing, and layer creation.
 */

import type { LayerDefinition, ImportFormat } from '../../../../shared/types/layer-types'
import { LayerImportValidator, type ValidationResult } from './layer-import-validator'
import { GeoJSONProcessor } from './processors/geojson-processor'
import { ShapefileProcessor } from './processors/shapefile-processor'
import { RasterProcessor } from './processors/raster-processor'

export interface ImportResult {
  success: boolean
  layerIds: string[]
  errors: string[]
  warnings: string[]
}

export class LayerImportService {
  /**
   * Validate if file is supported for import
   */
  static validateFile(file: File): ValidationResult {
    return LayerImportValidator.validateFile(file)
  }

  /**
   * Process file and create layer definition
   */
  static async processFile(file: File, format: ImportFormat): Promise<LayerDefinition> {
    const fileName = file.name.replace(/\.[^/.]+$/, '') // Remove extension

    try {
      switch (format) {
        case 'geojson':
          return await GeoJSONProcessor.processFile(file, fileName)
        
        case 'shapefile':
          return await ShapefileProcessor.processFile(file, fileName)
        
        case 'geotiff':
          return await RasterProcessor.processFile(file, fileName)
        
        default:
          throw new Error(`Processing for ${format} format not yet implemented`)
      }
    } catch (error) {
      throw new Error(
        `Failed to process ${format} file: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
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
    const warnings: string[] = []

    switch (format) {
      case 'geotiff':
        const rasterRecommendations = RasterProcessor.getProcessingRecommendations(file)
        warnings.push(...rasterRecommendations.warnings.map(w => `${file.name}: ${w}`))
        break
      
      case 'shapefile':
        // Add shapefile-specific warnings if needed
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
    details?: any
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

    // Get format-specific details
    try {
      let details: any = {}

      switch (validation.format) {
        case 'geojson':
          const text = await file.text()
          const geoJsonData = JSON.parse(text)
          details = GeoJSONProcessor.getSummaryInfo(geoJsonData)
          break
        
        case 'shapefile':
          details = await ShapefileProcessor.analyzeShapefileContents(file)
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
  static cleanupLayer(layerDefinition: LayerDefinition): void {
    if (layerDefinition.type === 'raster' && 
        typeof layerDefinition.sourceConfig.data === 'string') {
      RasterProcessor.cleanupBlobUrl(layerDefinition.sourceConfig.data)
    }
  }
}

// Re-export commonly used types and constants
export { SUPPORTED_FORMATS, type SupportedMimeType, type SupportedFormat } from './layer-import-validator'
export type { ValidationResult } from './layer-import-validator'