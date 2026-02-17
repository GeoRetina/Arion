/**
 * Raster Metadata Extractor
 *
 * Extracts metadata from raster data sources (GeoTIFF, images).
 * Handles basic file information since detailed raster analysis
 * requires specialized libraries in the main process.
 */

import type { LayerMetadata } from '../../../../../shared/types/layer-types'

export class RasterMetadataExtractor {
  /**
   * Extract basic metadata from raster file
   *
   * Note: This extracts only basic file information since we're in the renderer process.
   * Detailed GeoTIFF metadata extraction happens in the main process using geotiff library.
   */
  static extractRasterMetadata(_file: File, fileName: string): LayerMetadata {
    return {
      description: `Imported GeoTIFF raster file: ${fileName}`,
      tags: ['imported', 'raster', 'geotiff'],
      source: 'file-import',
      featureCount: 1, // Raster is considered one feature
      attributes: {
        fileName: {
          type: 'string',
          nullable: false
        },
        fileSize: {
          type: 'number',
          nullable: false
        },
        fileSizeFormatted: {
          type: 'string',
          nullable: false
        },
        lastModified: {
          type: 'string',
          nullable: false
        }
      }
    }
  }

  /**
   * Format file size in human-readable format
   */
  static formatFileSize(bytes: number): string {
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
   * Extract file type information
   */
  static getFileTypeInfo(file: File): {
    mimeType: string
    extension: string
    isGeoTIFF: boolean
    isPotentiallyGeoreferenced: boolean
  } {
    const extension = file.name.toLowerCase().split('.').pop() || ''
    const mimeType = file.type || 'application/octet-stream'

    const isGeoTIFF = extension === 'tif' || extension === 'tiff'
    const isPotentiallyGeoreferenced = isGeoTIFF

    return {
      mimeType,
      extension,
      isGeoTIFF,
      isPotentiallyGeoreferenced
    }
  }

  /**
   * Create enhanced metadata with additional file information
   */
  static extractEnhancedMetadata(file: File, fileName: string): LayerMetadata {
    const fileInfo = this.getFileTypeInfo(file)
    const formattedSize = this.formatFileSize(file.size)

    const baseMetadata = this.extractRasterMetadata(file, fileName)

    return {
      ...baseMetadata,
      description: `${fileInfo.isGeoTIFF ? 'GeoTIFF' : 'Raster'} file: ${fileName} (${formattedSize})`,
      tags: [
        'imported',
        'raster',
        fileInfo.extension,
        ...(fileInfo.isGeoTIFF ? ['geotiff'] : []),
        ...(fileInfo.isPotentiallyGeoreferenced ? ['georeferenced'] : [])
      ],
      attributes: {
        ...baseMetadata.attributes,
        mimeType: {
          type: 'string',
          nullable: false
        },
        extension: {
          type: 'string',
          nullable: false
        },
        isGeoTIFF: {
          type: 'boolean',
          nullable: false
        }
      }
    }
  }

  /**
   * Validate raster file before processing
   */
  static validateRasterFile(file: File): { valid: boolean; error?: string } {
    const fileInfo = this.getFileTypeInfo(file)

    // Basic validation
    if (file.size === 0) {
      return { valid: false, error: 'File is empty' }
    }

    // Check if it's a supported raster format
    const supportedExtensions = ['tif', 'tiff']
    if (!supportedExtensions.includes(fileInfo.extension)) {
      return {
        valid: false,
        error: `Unsupported raster format: ${fileInfo.extension}. Supported: ${supportedExtensions.join(', ')}`
      }
    }

    return { valid: true }
  }
}
