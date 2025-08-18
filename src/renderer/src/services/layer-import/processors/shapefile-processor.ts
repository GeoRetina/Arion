/**
 * Shapefile Processor
 *
 * Handles processing of Shapefile (ZIP) archives for layer import.
 * Uses shpjs library to parse shapefiles and convert to GeoJSON.
 */

import { v4 as uuidv4 } from 'uuid'
import shp from 'shpjs'
import type {
  LayerDefinition,
  LayerType,
  LayerSourceConfig
} from '../../../../../shared/types/layer-types'
import { VectorMetadataExtractor } from '../metadata/vector-metadata-extractor'
import { LayerStyleFactory } from '../styles/layer-style-factory'

export class ShapefileProcessor {
  /**
   * Process Shapefile (ZIP archive) and create layer definition
   */
  static async processFile(file: File, fileName: string): Promise<LayerDefinition> {
    const arrayBuffer = await file.arrayBuffer()

    try {
      // Parse shapefile using shpjs - it handles ZIP files automatically
      const geoJsonData = await shp(arrayBuffer)

      // Normalize the shpjs output
      const normalizedData = this.normalizeShapefileOutput(geoJsonData)

      // Validate the result
      this.validateShapefileData(normalizedData)

      // Extract metadata and create style
      const metadata = VectorMetadataExtractor.extractShapefileMetadata(normalizedData, fileName)
      const style = LayerStyleFactory.createVectorStyle(metadata.geometryType)

      return {
        id: uuidv4(),
        name: fileName,
        type: 'vector' as LayerType,
        sourceId: `source-${uuidv4()}`,
        sourceConfig: {
          type: 'geojson',
          data: normalizedData
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
        `Failed to parse shapefile: ${error instanceof Error ? error.message : 'Unknown parsing error'}`
      )
    }
  }

  /**
   * Normalize shpjs output to consistent FeatureCollection format
   */
  private static normalizeShapefileOutput(shpjsOutput: any): any {
    // shpjs can return a single FeatureCollection or an array of FeatureCollections
    if (Array.isArray(shpjsOutput)) {
      if (shpjsOutput.length === 0) {
        throw new Error('No valid shapefiles found in ZIP archive')
      }

      // If multiple shapefiles, merge them into a single FeatureCollection
      if (shpjsOutput.length > 1) {
        const mergedFeatures: any[] = []
        shpjsOutput.forEach((fc) => {
          if (fc.features && Array.isArray(fc.features)) {
            mergedFeatures.push(...fc.features)
          }
        })

        return {
          type: 'FeatureCollection',
          features: mergedFeatures
        }
      } else {
        return shpjsOutput[0]
      }
    }

    return shpjsOutput
  }

  /**
   * Validate shapefile data structure
   */
  private static validateShapefileData(geoJsonData: any): void {
    if (!geoJsonData || !geoJsonData.features || !Array.isArray(geoJsonData.features)) {
      throw new Error('Invalid shapefile structure - no features found')
    }

    if (geoJsonData.features.length === 0) {
      throw new Error('Shapefile contains no features')
    }
  }

  /**
   * Validate ZIP file contains shapefile components
   */
  static async validateShapefileZip(
    file: File
  ): Promise<{ valid: boolean; error?: string; info?: string }> {
    try {
      const arrayBuffer = await file.arrayBuffer()

      // Try to parse with shpjs to see if it's a valid shapefile
      const result = await shp(arrayBuffer)

      if (Array.isArray(result)) {
        if (result.length === 0) {
          return { valid: false, error: 'ZIP archive contains no valid shapefiles' }
        }
        return {
          valid: true,
          info: `Found ${result.length} shapefile(s) in ZIP archive`
        }
      } else if (result && result.features) {
        return {
          valid: true,
          info: `Found shapefile with ${result.features.length} features`
        }
      }

      return { valid: false, error: 'ZIP archive does not contain valid shapefile data' }
    } catch (error) {
      return {
        valid: false,
        error: `Failed to validate shapefile: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  /**
   * Extract information about shapefile components
   */
  static async analyzeShapefileContents(file: File): Promise<{
    shapefileCount: number
    totalFeatures: number
    geometryTypes: string[]
    hasAttributes: boolean
    attributeKeys: string[]
  }> {
    const arrayBuffer = await file.arrayBuffer()
    const shpjsOutput = await shp(arrayBuffer)
    const shapefiles = Array.isArray(shpjsOutput) ? shpjsOutput : [shpjsOutput]

    let totalFeatures = 0
    const geometryTypes = new Set<string>()
    const attributeKeys = new Set<string>()
    let hasAttributes = false

    shapefiles.forEach((shapefile) => {
      if (shapefile.features && Array.isArray(shapefile.features)) {
        totalFeatures += shapefile.features.length

        shapefile.features.forEach((feature: any) => {
          if (feature.geometry?.type) {
            geometryTypes.add(feature.geometry.type)
          }

          if (feature.properties && Object.keys(feature.properties).length > 0) {
            hasAttributes = true
            Object.keys(feature.properties).forEach((key) => attributeKeys.add(key))
          }
        })
      }
    })

    return {
      shapefileCount: shapefiles.length,
      totalFeatures,
      geometryTypes: Array.from(geometryTypes),
      hasAttributes,
      attributeKeys: Array.from(attributeKeys)
    }
  }
}
