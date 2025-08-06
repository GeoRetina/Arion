/**
 * Layer Import Validator
 *
 * Handles validation of files before import processing.
 * Validates file size, MIME types, and extensions.
 */

import type { ImportFormat } from '../../../../shared/types/layer-types'

// Supported file types and their MIME types
export const SUPPORTED_FORMATS = {
  // Vector formats
  'application/json': 'geojson',
  'application/geo+json': 'geojson',
  'text/json': 'geojson',

  // Shapefile (as ZIP archive)
  'application/zip': 'shapefile',
  'application/x-zip-compressed': 'shapefile',

  // Raster formats
  'image/tiff': 'geotiff',
  'image/tif': 'geotiff'
} as const

export type SupportedMimeType = keyof typeof SUPPORTED_FORMATS
export type SupportedFormat = (typeof SUPPORTED_FORMATS)[SupportedMimeType]

export interface ValidationResult {
  valid: boolean
  format?: ImportFormat
  error?: string
}

export class LayerImportValidator {

  private static readonly EXTENSION_MAP: Record<string, ImportFormat> = {
    json: 'geojson',
    geojson: 'geojson',
    zip: 'shapefile',
    tif: 'geotiff',
    tiff: 'geotiff'
  }

  /**
   * Validate if file is supported for import
   */
  static validateFile(file: File): ValidationResult {
    // Only validate format - no file size restrictions
    return this.validateFileFormat(file)
  }

  /**
   * Validate and determine file format
   */
  private static validateFileFormat(file: File): ValidationResult {
    // Check MIME type first
    let format = SUPPORTED_FORMATS[file.type as SupportedMimeType]

    // Special handling for ZIP files
    if (this.isZipFile(file.type)) {
      format = this.detectZipFormat(file.name)
    }

    if (!format) {
      // Fallback to file extension check
      const formatFromExt = this.getFormatFromExtension(file.name)
      if (!formatFromExt) {
        return {
          valid: false,
          error: `Unsupported file format: ${file.type || 'unknown'}. Supported formats: GeoJSON, Shapefile (ZIP), GeoTIFF`
        }
      }
      format = formatFromExt
    }

    return { valid: true, format }
  }

  /**
   * Check if file is a ZIP archive
   */
  private static isZipFile(mimeType: string): boolean {
    return mimeType === 'application/zip' || mimeType === 'application/x-zip-compressed'
  }

  /**
   * Detect format for ZIP files based on filename
   */
  private static detectZipFormat(fileName: string): ImportFormat {
    const lowerName = fileName.toLowerCase()
    if (lowerName.includes('shp') || lowerName.includes('shapefile') || !lowerName.includes('.')) {
      return 'shapefile'
    }
    return 'shapefile' // Default assumption for ZIP files
  }

  /**
   * Get format from file extension
   */
  private static getFormatFromExtension(fileName: string): ImportFormat | null {
    const extension = fileName.toLowerCase().split('.').pop()
    if (!extension) return null
    return this.EXTENSION_MAP[extension] || null
  }
}
