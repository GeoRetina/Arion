import type { GeometryType } from '../../../../../shared/types/layer-types'

export type GeoJsonRecord = Record<string, unknown>

type MetadataFeatureLike = {
  geometry?: {
    type?: GeometryType
    coordinates?: unknown
  }
  properties?: Record<string, unknown>
}

const GEOMETRY_TYPES = new Set<GeometryType>([
  'Point',
  'LineString',
  'Polygon',
  'MultiPoint',
  'MultiLineString',
  'MultiPolygon',
  'GeometryCollection'
])

export function asGeoJsonRecord(value: unknown): GeoJsonRecord | null {
  return value && typeof value === 'object' ? (value as GeoJsonRecord) : null
}

export function toMetadataFeature(feature: GeoJsonRecord): MetadataFeatureLike {
  const geometryRecord = asGeoJsonRecord(feature.geometry)
  const propertiesRecord = asGeoJsonRecord(feature.properties)

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

function isGeometryType(value: unknown): value is GeometryType {
  return typeof value === 'string' && GEOMETRY_TYPES.has(value as GeometryType)
}
