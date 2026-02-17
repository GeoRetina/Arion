/**
 * Raster Processor
 *
 * Handles processing of raster files (GeoTIFF, images) for layer import.
 * Creates blob URLs and layer definitions for raster data.
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  LayerDefinition,
  LayerType,
  LayerSourceConfig
} from '../../../../../shared/types/layer-types'
import { RasterMetadataExtractor } from '../metadata/raster-metadata-extractor'
import { LayerStyleFactory } from '../styles/layer-style-factory'

export class RasterProcessor {
  /**
   * Process raster file and create layer definition
   */
  static async processFile(file: File, fileName: string): Promise<LayerDefinition> {
    try {
      // Validate the raster file first
      const validation = RasterMetadataExtractor.validateRasterFile(file)
      if (!validation.valid) {
        throw new Error(validation.error)
      }

      const fileInfo = RasterMetadataExtractor.getFileTypeInfo(file)
      let imageUrl: string
      let bounds: [number, number, number, number] | undefined

      // Process GeoTIFF files for proper display, use blob URL for others
      if (fileInfo.isGeoTIFF) {
        try {
          const fileBuffer = await file.arrayBuffer()
          const result = await window.ctg.layers.processGeotiff(fileBuffer, fileName)
          imageUrl = result.imageUrl
          bounds = result.bounds
        } catch {
          // Fallback to blob URL if processing fails
          imageUrl = URL.createObjectURL(file)
        }
      } else {
        imageUrl = URL.createObjectURL(file)
      }

      // Extract metadata
      const metadata = RasterMetadataExtractor.extractEnhancedMetadata(file, fileName)

      // Add bounds to metadata for zoom-to-layer functionality
      if (bounds) {
        metadata.bounds = bounds
      }

      // Create default raster style
      const style = LayerStyleFactory.createRasterStyle()

      return {
        id: uuidv4(),
        name: fileName,
        type: 'raster' as LayerType,
        sourceId: `source-${uuidv4()}`,
        sourceConfig: {
          type: 'image',
          data: imageUrl,
          options: bounds ? { bounds } : undefined
        } as LayerSourceConfig,
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
      suggestions.push('Large files may take longer to process and render')
    }

    if (!fileInfo.isGeoTIFF) {
      warnings.push('Non-GeoTIFF files may lack spatial reference information')
      suggestions.push('Ensure the image has proper georeferencing')
    }

    return { complexity, warnings, suggestions }
  }
}
