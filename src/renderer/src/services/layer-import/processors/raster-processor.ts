/**
 * Raster Processor
 * 
 * Handles processing of raster files (GeoTIFF, images) for layer import.
 * Creates blob URLs and layer definitions for raster data.
 */

import { v4 as uuidv4 } from 'uuid'
import type { LayerDefinition, LayerType, LayerSourceConfig } from '../../../../../shared/types/layer-types'
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

      // Create a blob URL for the file - simple and works with existing image processing
      const blobUrl = URL.createObjectURL(file)
      
      // Extract metadata
      const metadata = RasterMetadataExtractor.extractEnhancedMetadata(file, fileName)
      
      // Create default raster style
      const style = LayerStyleFactory.createRasterStyle()

      return {
        id: uuidv4(),
        name: fileName,
        type: 'raster' as LayerType,
        sourceId: `source-${uuidv4()}`,
        sourceConfig: {
          type: 'raster',
          data: blobUrl // Blob URL for the raster file
        } as LayerSourceConfig,
        style,
        visibility: true,
        opacity: 1.0,
        zIndex: 0,
        metadata,
        isLocked: false,
        createdBy: 'import',
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
  static getFileInfo(file: File) {
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