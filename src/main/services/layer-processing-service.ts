/**
 * Layer Processing Service
 * 
 * Handles processing of various layer file formats, particularly GeoTIFF files.
 * Provides conversion utilities and geographic metadata extraction.
 */

import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { convertImageFileToDataUri, extractGeoTiffBounds } from '../lib/image-processing'

export interface GeoTiffProcessingResult {
  imageUrl: string
  bounds?: [number, number, number, number]
}

export class LayerProcessingService {
  /**
   * Process a GeoTIFF file buffer into a displayable format with geographic bounds
   */
  async processGeotiff(fileBuffer: ArrayBuffer, fileName: string): Promise<GeoTiffProcessingResult> {
    let tempFilePath: string | null = null
    
    try {
      // Create temporary file
      const tempDir = tmpdir()
      const ext = fileName.toLowerCase().endsWith('.tif') || fileName.toLowerCase().endsWith('.tiff') ? '' : '.tiff'
      tempFilePath = join(tempDir, `${Date.now()}-${fileName}${ext}`)
      
      // Write buffer to temporary file
      await fs.writeFile(tempFilePath, new Uint8Array(fileBuffer))
      
      // Process the file
      const imageUrl = await convertImageFileToDataUri(tempFilePath)
      const bounds = await extractGeoTiffBounds(tempFilePath)
      
      return { imageUrl, bounds }
    } catch (error) {
      // If bounds extraction fails, try to still return the image
      if (tempFilePath) {
        try {
          const imageUrl = await convertImageFileToDataUri(tempFilePath)
          return { imageUrl }
        } catch {
          throw error
        }
      }
      throw error
    } finally {
      // Clean up temporary file
      if (tempFilePath) {
        try {
          await fs.unlink(tempFilePath)
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }

  /**
   * Validate if a file buffer represents a valid GeoTIFF
   */
  validateGeoTiff(fileBuffer: ArrayBuffer): boolean {
    // Check for TIFF magic numbers
    const uint8View = new Uint8Array(fileBuffer.slice(0, 4))
    
    // Little-endian TIFF: 0x49, 0x49, 0x2A, 0x00
    // Big-endian TIFF: 0x4D, 0x4D, 0x00, 0x2A
    const isLittleEndianTiff = 
      uint8View[0] === 0x49 && uint8View[1] === 0x49 && 
      uint8View[2] === 0x2A && uint8View[3] === 0x00
    
    const isBigEndianTiff = 
      uint8View[0] === 0x4D && uint8View[1] === 0x4D && 
      uint8View[2] === 0x00 && uint8View[3] === 0x2A
    
    return isLittleEndianTiff || isBigEndianTiff
  }

  /**
   * Get processing recommendations for a file
   */
  getProcessingRecommendations(fileSize: number, fileName: string): {
    complexity: 'low' | 'medium' | 'high'
    warnings: string[]
    suggestions: string[]
  } {
    const sizeMB = fileSize / (1024 * 1024)
    const warnings: string[] = []
    const suggestions: string[] = []
    
    let complexity: 'low' | 'medium' | 'high' = 'low'
    
    if (sizeMB > 100) {
      complexity = 'high'
      suggestions.push('Large files may take longer to process and render')
    } else if (sizeMB > 10) {
      complexity = 'medium'
    }
    
    const isGeoTiff = fileName.toLowerCase().endsWith('.tif') || fileName.toLowerCase().endsWith('.tiff')
    if (!isGeoTiff) {
      warnings.push('Non-GeoTIFF files may lack spatial reference information')
      suggestions.push('Ensure the image has proper georeferencing')
    }
    
    return { complexity, warnings, suggestions }
  }
}

// Global service instance
let processingService: LayerProcessingService | null = null

export function getLayerProcessingService(): LayerProcessingService {
  if (!processingService) {
    processingService = new LayerProcessingService()
  }
  return processingService
}