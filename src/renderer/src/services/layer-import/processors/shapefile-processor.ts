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
  GeometryType,
  LayerType,
  LayerSourceConfig
} from '../../../../../shared/types/layer-types'
import { VectorMetadataExtractor } from '../metadata/vector-metadata-extractor'
import { LayerStyleFactory } from '../styles/layer-style-factory'

type ShapefileRecord = Record<string, unknown>
type ShapefileFeatureCollection = {
  type: 'FeatureCollection'
  features: ShapefileRecord[]
}

type MetadataFeatureLike = {
  geometry?: {
    type?: GeometryType
    coordinates?: unknown
  }
  properties?: Record<string, unknown>
}

const geometryTypes = new Set<GeometryType>([
  'Point',
  'LineString',
  'Polygon',
  'MultiPoint',
  'MultiLineString',
  'MultiPolygon',
  'GeometryCollection'
])

function asRecord(value: unknown): ShapefileRecord | null {
  return value && typeof value === 'object' ? (value as ShapefileRecord) : null
}

function isGeometryType(value: unknown): value is GeometryType {
  return typeof value === 'string' && geometryTypes.has(value as GeometryType)
}

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
      const metadata = VectorMetadataExtractor.extractShapefileMetadata(
        {
          features: normalizedData.features.map((feature) => this.toMetadataFeature(feature))
        },
        fileName
      )
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
  private static normalizeShapefileOutput(shpjsOutput: unknown): ShapefileFeatureCollection {
    // shpjs can return a single FeatureCollection or an array of FeatureCollections
    if (Array.isArray(shpjsOutput)) {
      if (shpjsOutput.length === 0) {
        throw new Error('No valid shapefiles found in ZIP archive')
      }

      // If multiple shapefiles, merge them into a single FeatureCollection
      if (shpjsOutput.length > 1) {
        const mergedFeatures = shpjsOutput
          .map((featureCollection) => this.toFeatureCollection(featureCollection))
          .filter((featureCollection): featureCollection is ShapefileFeatureCollection =>
            Boolean(featureCollection)
          )
          .flatMap((featureCollection) => featureCollection.features)

        return {
          type: 'FeatureCollection',
          features: mergedFeatures
        }
      } else {
        const featureCollection = this.toFeatureCollection(shpjsOutput[0])
        if (!featureCollection) {
          throw new Error('Invalid shapefile structure - no features found')
        }
        return featureCollection
      }
    }

    const featureCollection = this.toFeatureCollection(shpjsOutput)
    if (!featureCollection) {
      throw new Error('Invalid shapefile structure - no features found')
    }

    return featureCollection
  }

  /**
   * Validate shapefile data structure
   */
  private static validateShapefileData(geoJsonData: ShapefileFeatureCollection): void {
    if (!Array.isArray(geoJsonData.features)) {
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
        const collections = result
          .map((item) => this.toFeatureCollection(item))
          .filter((item): item is ShapefileFeatureCollection => Boolean(item))
        if (collections.length === 0) {
          return { valid: false, error: 'ZIP archive contains no valid shapefiles' }
        }
        return {
          valid: true,
          info: `Found ${collections.length} shapefile(s) in ZIP archive`
        }
      }

      const collection = this.toFeatureCollection(result)
      if (collection) {
        return {
          valid: true,
          info: `Found shapefile with ${collection.features.length} features`
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
    const shapefiles = (Array.isArray(shpjsOutput) ? shpjsOutput : [shpjsOutput])
      .map((shapefile) => this.toFeatureCollection(shapefile))
      .filter((shapefile): shapefile is ShapefileFeatureCollection => Boolean(shapefile))

    let totalFeatures = 0
    const geometryTypes = new Set<string>()
    const attributeKeys = new Set<string>()
    let hasAttributes = false

    shapefiles.forEach((shapefile) => {
      totalFeatures += shapefile.features.length

      shapefile.features.forEach((feature) => {
        const featureRecord = asRecord(feature)
        if (!featureRecord) {
          return
        }
        const geometryRecord = asRecord(featureRecord.geometry)
        if (typeof geometryRecord?.type === 'string') {
          geometryTypes.add(geometryRecord.type)
        }

        const propertiesRecord = asRecord(featureRecord.properties)
        if (propertiesRecord && Object.keys(propertiesRecord).length > 0) {
          hasAttributes = true
          Object.keys(propertiesRecord).forEach((key) => attributeKeys.add(key))
        }
      })
    })

    return {
      shapefileCount: shapefiles.length,
      totalFeatures,
      geometryTypes: Array.from(geometryTypes),
      hasAttributes,
      attributeKeys: Array.from(attributeKeys)
    }
  }

  private static toFeatureCollection(shpjsOutput: unknown): ShapefileFeatureCollection | null {
    const outputRecord = asRecord(shpjsOutput)
    if (!outputRecord) {
      return null
    }

    const features = Array.isArray(outputRecord.features)
      ? outputRecord.features.filter((feature): feature is ShapefileRecord =>
          Boolean(asRecord(feature))
        )
      : null

    if (!features) {
      return null
    }

    return {
      type: 'FeatureCollection',
      features
    }
  }

  private static toMetadataFeature(feature: ShapefileRecord): MetadataFeatureLike {
    const geometryRecord = asRecord(feature.geometry)
    const propertiesRecord = asRecord(feature.properties)

    return {
      geometry: geometryRecord
        ? {
            type: isGeometryType(geometryRecord.type) ? geometryRecord.type : undefined,
            coordinates: geometryRecord.coordinates
          }
        : undefined,
      properties: propertiesRecord ?? undefined
    }
  }
}
