/**
 * GeoJSON Processor
 *
 * Handles processing of GeoJSON files for layer import.
 * Validates structure, normalizes format, and creates layer definitions.
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  LayerDefinition,
  GeometryType,
  LayerType,
  LayerSourceConfig
} from '../../../../../shared/types/layer-types'
import { VectorMetadataExtractor } from '../metadata/vector-metadata-extractor'
import { LayerStyleFactory } from '../styles/layer-style-factory'

type GeoJsonRecord = Record<string, unknown>
type GeoJsonFeatureCollection = { type: 'FeatureCollection'; features: GeoJsonRecord[] }

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

function asRecord(value: unknown): GeoJsonRecord | null {
  return value && typeof value === 'object' ? (value as GeoJsonRecord) : null
}

function isGeometryType(value: unknown): value is GeometryType {
  return typeof value === 'string' && geometryTypes.has(value as GeometryType)
}

export class GeoJSONProcessor {
  /**
   * Process GeoJSON file and create layer definition
   */
  static async processFile(file: File, fileName: string): Promise<LayerDefinition> {
    const text = await file.text()
    let geoJsonData: unknown

    try {
      geoJsonData = JSON.parse(text)
    } catch {
      throw new Error('Invalid JSON format')
    }

    // Normalize to FeatureCollection
    const normalizedData = this.normalizeToFeatureCollection(geoJsonData)

    // Extract metadata and create style
    const metadata = VectorMetadataExtractor.extractGeoJSONMetadata({
      features: normalizedData.features.map((feature) => this.toMetadataFeature(feature))
    })
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
  private static normalizeToFeatureCollection(geoJsonData: unknown): GeoJsonFeatureCollection {
    const geoJsonRecord = asRecord(geoJsonData)
    const geoJsonType = geoJsonRecord?.type
    if (!geoJsonRecord || typeof geoJsonType !== 'string') {
      throw new Error('Invalid GeoJSON structure')
    }

    if (geoJsonType === 'FeatureCollection') {
      const features = Array.isArray(geoJsonRecord.features)
        ? geoJsonRecord.features.filter((feature): feature is GeoJsonRecord =>
            Boolean(asRecord(feature))
          )
        : []
      return {
        type: 'FeatureCollection',
        features
      }
    }

    if (geoJsonType === 'Feature') {
      return {
        type: 'FeatureCollection',
        features: [geoJsonRecord]
      }
    }

    if (geoJsonRecord.coordinates) {
      // Single geometry
      return {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: geoJsonRecord,
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
  static validateGeoJSON(data: unknown): { valid: boolean; error?: string } {
    const dataRecord = asRecord(data)
    if (!dataRecord) {
      return { valid: false, error: 'Invalid GeoJSON: not an object' }
    }

    if (typeof dataRecord.type !== 'string') {
      return { valid: false, error: 'Invalid GeoJSON: missing type property' }
    }
    const dataType = dataRecord.type

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

    if (!validTypes.includes(dataType)) {
      return { valid: false, error: `Invalid GeoJSON: invalid type '${dataType}'` }
    }

    // Additional validation based on type
    if (dataType === 'FeatureCollection') {
      if (!Array.isArray(dataRecord.features)) {
        return { valid: false, error: 'Invalid FeatureCollection: features must be an array' }
      }
    }

    if (dataType === 'Feature') {
      if (!dataRecord.geometry) {
        return { valid: false, error: 'Invalid Feature: missing geometry' }
      }
    }

    // Geometry types need coordinates
    if (
      ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'].includes(
        dataType
      )
    ) {
      if (!dataRecord.coordinates) {
        return { valid: false, error: `Invalid ${dataType}: missing coordinates` }
      }
    }

    return { valid: true }
  }

  /**
   * Extract summary information from GeoJSON
   */
  static getSummaryInfo(geoJsonData: unknown): {
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

    features.forEach((feature) => {
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
        hasProperties = true
        Object.keys(propertiesRecord).forEach((key) => propertyKeys.add(key))
      }
    })

    return {
      featureCount: features.length,
      geometryTypes: Array.from(geometryTypes),
      hasProperties,
      propertyKeys: Array.from(propertyKeys)
    }
  }

  private static toMetadataFeature(feature: GeoJsonRecord): MetadataFeatureLike {
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
