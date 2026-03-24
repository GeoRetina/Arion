import { VectorMetadataExtractor } from './vector-metadata-extractor'
import type { LayerMetadata } from '../types/layer-types'

export type GeoJsonRecord = Record<string, unknown>

export type GeoJsonFeatureCollection = {
  type: 'FeatureCollection'
  features: GeoJsonRecord[]
}

type FeatureMetadataExtractor = (
  collection: GeoJsonFeatureCollection,
  context?: Record<string, unknown>
) => LayerMetadata

export interface GeoJsonFeatureSummary {
  featureCount: number
  geometryTypes: string[]
  hasProperties: boolean
  propertyKeys: string[]
}

export function normalizeGeoJson(value: unknown): GeoJsonFeatureCollection {
  const geoJsonRecord = asGeoJsonRecord(value)
  if (!geoJsonRecord || typeof geoJsonRecord.type !== 'string') {
    throw new Error('Invalid GeoJSON structure')
  }

  if (geoJsonRecord.type === 'FeatureCollection') {
    return {
      type: 'FeatureCollection',
      features: Array.isArray(geoJsonRecord.features)
        ? geoJsonRecord.features.filter((feature): feature is GeoJsonRecord =>
            Boolean(asGeoJsonRecord(feature))
          )
        : []
    }
  }

  if (geoJsonRecord.type === 'Feature') {
    return {
      type: 'FeatureCollection',
      features: [geoJsonRecord]
    }
  }

  if ('coordinates' in geoJsonRecord) {
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

export function normalizeShapefileOutput(shpjsOutput: unknown): GeoJsonFeatureCollection {
  if (Array.isArray(shpjsOutput)) {
    if (shpjsOutput.length === 0) {
      throw new Error('No valid shapefiles found in ZIP archive')
    }

    if (shpjsOutput.length === 1) {
      const singleCollection = toFeatureCollection(shpjsOutput[0])
      if (!singleCollection) {
        throw new Error('Invalid shapefile structure - no features found')
      }

      return singleCollection
    }

    const mergedFeatures = shpjsOutput
      .map((featureCollection) => toFeatureCollection(featureCollection))
      .filter((featureCollection): featureCollection is GeoJsonFeatureCollection =>
        Boolean(featureCollection)
      )
      .flatMap((featureCollection) => featureCollection.features)

    return {
      type: 'FeatureCollection',
      features: mergedFeatures
    }
  }

  const featureCollection = toFeatureCollection(shpjsOutput)
  if (!featureCollection) {
    throw new Error('Invalid shapefile structure - no features found')
  }

  return featureCollection
}

export function assertFeatureCollectionHasFeatures(
  collection: GeoJsonFeatureCollection,
  emptyMessage: string
): void {
  if (!Array.isArray(collection.features)) {
    throw new Error(emptyMessage)
  }

  if (collection.features.length === 0) {
    throw new Error(emptyMessage)
  }
}

export function buildGeoJsonMetadata(
  normalizedGeoJson: GeoJsonFeatureCollection,
  sourcePath?: string
): LayerMetadata {
  return buildVectorMetadata(
    normalizedGeoJson,
    (collection, context) => VectorMetadataExtractor.extractGeoJSONMetadata(collection, context),
    sourcePath
  )
}

export function buildShapefileMetadata(
  normalizedGeoJson: GeoJsonFeatureCollection,
  sourcePath?: string
): LayerMetadata {
  return buildVectorMetadata(
    normalizedGeoJson,
    (collection, context) => VectorMetadataExtractor.extractShapefileMetadata(collection, context),
    sourcePath
  )
}

export function summarizeFeatureCollections(
  collections: GeoJsonFeatureCollection[]
): GeoJsonFeatureSummary {
  const geometryTypes = new Set<string>()
  const propertyKeys = new Set<string>()
  let featureCount = 0
  let hasProperties = false

  for (const collection of collections) {
    featureCount += collection.features.length

    for (const feature of collection.features) {
      const featureRecord = asGeoJsonRecord(feature)
      if (!featureRecord) {
        continue
      }

      const geometryRecord = asGeoJsonRecord(featureRecord.geometry)
      if (typeof geometryRecord?.type === 'string') {
        geometryTypes.add(geometryRecord.type)
      }

      const propertiesRecord = asGeoJsonRecord(featureRecord.properties)
      if (propertiesRecord && Object.keys(propertiesRecord).length > 0) {
        hasProperties = true
        Object.keys(propertiesRecord).forEach((key) => propertyKeys.add(key))
      }
    }
  }

  return {
    featureCount,
    geometryTypes: Array.from(geometryTypes),
    hasProperties,
    propertyKeys: Array.from(propertyKeys)
  }
}

export function asGeoJsonRecord(value: unknown): GeoJsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as GeoJsonRecord)
    : null
}

function toFeatureCollection(shpjsOutput: unknown): GeoJsonFeatureCollection | null {
  const outputRecord = asGeoJsonRecord(shpjsOutput)
  if (!outputRecord) {
    return null
  }

  const features = Array.isArray(outputRecord.features)
    ? outputRecord.features.filter((feature): feature is GeoJsonRecord =>
        Boolean(asGeoJsonRecord(feature))
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

function buildVectorMetadata(
  normalizedGeoJson: GeoJsonFeatureCollection,
  extractor: FeatureMetadataExtractor,
  sourcePath?: string
): LayerMetadata {
  return extractor(normalizedGeoJson, sourcePath ? { localFilePath: sourcePath } : undefined)
}
