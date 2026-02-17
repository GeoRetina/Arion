/**
 * GeoJSON Processor
 *
 * Handles processing of GeoJSON files for layer import.
 * Validates structure, normalizes format, and creates layer definitions.
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  LayerDefinition,
  LayerType,
  LayerSourceConfig
} from '../../../../../shared/types/layer-types'
import { VectorMetadataExtractor } from '../metadata/vector-metadata-extractor'
import { LayerStyleFactory } from '../styles/layer-style-factory'

export class GeoJSONProcessor {
  /**
   * Process GeoJSON file and create layer definition
   */
  static async processFile(file: File, fileName: string): Promise<LayerDefinition> {
    const text = await file.text()
    let geoJsonData: any

    try {
      geoJsonData = JSON.parse(text)
    } catch {
      throw new Error('Invalid JSON format')
    }

    // Normalize to FeatureCollection
    const normalizedData = this.normalizeToFeatureCollection(geoJsonData)

    // Extract metadata and create style
    const metadata = VectorMetadataExtractor.extractGeoJSONMetadata(normalizedData)
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
  }

  /**
   * Normalize GeoJSON to FeatureCollection format
   */
  private static normalizeToFeatureCollection(geoJsonData: any): any {
    if (geoJsonData.type === 'FeatureCollection') {
      return geoJsonData
    }

    if (geoJsonData.type === 'Feature') {
      return {
        type: 'FeatureCollection',
        features: [geoJsonData]
      }
    }

    if (geoJsonData.type && geoJsonData.coordinates) {
      // Single geometry
      return {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: geoJsonData,
            properties: {}
          }
        ]
      }
    }

    throw new Error('Invalid GeoJSON structure')
  }

  /**
   * Validate GeoJSON structure
   */
  static validateGeoJSON(data: any): { valid: boolean; error?: string } {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Invalid GeoJSON: not an object' }
    }

    if (!data.type) {
      return { valid: false, error: 'Invalid GeoJSON: missing type property' }
    }

    const validTypes = [
      'FeatureCollection',
      'Feature',
      'Point',
      'LineString',
      'Polygon',
      'MultiPoint',
      'MultiLineString',
      'MultiPolygon',
      'GeometryCollection'
    ]

    if (!validTypes.includes(data.type)) {
      return { valid: false, error: `Invalid GeoJSON: invalid type '${data.type}'` }
    }

    // Additional validation based on type
    if (data.type === 'FeatureCollection') {
      if (!Array.isArray(data.features)) {
        return { valid: false, error: 'Invalid FeatureCollection: features must be an array' }
      }
    }

    if (data.type === 'Feature') {
      if (!data.geometry) {
        return { valid: false, error: 'Invalid Feature: missing geometry' }
      }
    }

    // Geometry types need coordinates
    if (
      ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'].includes(
        data.type
      )
    ) {
      if (!data.coordinates) {
        return { valid: false, error: `Invalid ${data.type}: missing coordinates` }
      }
    }

    return { valid: true }
  }

  /**
   * Extract summary information from GeoJSON
   */
  static getSummaryInfo(geoJsonData: any): {
    featureCount: number
    geometryTypes: string[]
    hasProperties: boolean
    propertyKeys: string[]
  } {
    const normalized = this.normalizeToFeatureCollection(geoJsonData)
    const features = normalized.features || []

    const geometryTypes = new Set<string>()
    const propertyKeys = new Set<string>()
    let hasProperties = false

    features.forEach((feature: any) => {
      if (feature.geometry?.type) {
        geometryTypes.add(feature.geometry.type)
      }

      if (feature.properties && Object.keys(feature.properties).length > 0) {
        hasProperties = true
        Object.keys(feature.properties).forEach((key) => propertyKeys.add(key))
      }
    })

    return {
      featureCount: features.length,
      geometryTypes: Array.from(geometryTypes),
      hasProperties,
      propertyKeys: Array.from(propertyKeys)
    }
  }
}
