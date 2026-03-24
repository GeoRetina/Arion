import { basename, extname } from 'path'
import type { ImportGeoPackageResult } from '../../../shared/ipc-types'
import { VectorMetadataExtractor } from '../../../shared/lib/vector-metadata-extractor'
import type { LayerMetadata } from '../../../shared/types/layer-types'

export type GeoJsonRecord = Record<string, unknown>

export type GeoJsonFeatureCollection = {
  type: 'FeatureCollection'
  features: GeoJsonRecord[]
}

export function normalizeGeoJson(value: unknown): GeoJsonFeatureCollection {
  const geoJsonRecord = asRecord(value)
  if (!geoJsonRecord || typeof geoJsonRecord.type !== 'string') {
    throw new Error('Invalid GeoJSON structure')
  }

  if (geoJsonRecord.type === 'FeatureCollection') {
    return {
      type: 'FeatureCollection',
      features: Array.isArray(geoJsonRecord.features)
        ? geoJsonRecord.features.filter((feature): feature is GeoJsonRecord =>
            Boolean(asRecord(feature))
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

export function buildGeoJsonLayerMetadata(
  normalizedGeoJson: GeoJsonFeatureCollection,
  sourcePath: string
): LayerMetadata {
  return VectorMetadataExtractor.extractGeoJSONMetadata(
    {
      features: normalizedGeoJson.features.map((feature) => feature)
    },
    {
      localFilePath: sourcePath
    }
  )
}

export function buildGeoPackageLayerMetadata(
  importResult: ImportGeoPackageResult,
  sourcePath: string
): LayerMetadata {
  return VectorMetadataExtractor.extractGeopackageMetadata(
    {
      features: importResult.geojson.features.map((feature) => feature)
    },
    {
      sourceLayers: importResult.sourceLayers,
      sourceLayerCount: importResult.layerCount,
      importWarnings: importResult.warnings,
      mergedLayerPropertyName: importResult.mergedLayerPropertyName,
      localFilePath: sourcePath
    }
  )
}

export function basenameWithoutExtension(filePath: string): string {
  return basename(filePath, extname(filePath))
}

function asRecord(value: unknown): GeoJsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as GeoJsonRecord)
    : null
}
