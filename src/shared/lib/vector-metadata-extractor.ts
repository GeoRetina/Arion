import type { BoundingBox, GeometryType, LayerMetadata } from '../types/layer-types'

type FeatureLike = {
  geometry?: {
    type?: GeometryType
    coordinates?: unknown
  }
  properties?: Record<string, unknown>
}

type GeoJsonLike = {
  features?: FeatureLike[]
}

type CoordinateLike = [number, number]

export class VectorMetadataExtractor {
  static extractGeoJSONMetadata(
    geoJson: GeoJsonLike,
    context?: Record<string, unknown>
  ): LayerMetadata {
    return this.buildVectorMetadata(geoJson, {
      description: 'Imported GeoJSON file',
      tags: ['imported', 'geojson'],
      source: 'file-import',
      context
    })
  }

  static extractShapefileMetadata(
    geoJson: GeoJsonLike,
    context?: Record<string, unknown>
  ): LayerMetadata {
    return this.buildVectorMetadata(geoJson, {
      description: 'Imported Shapefile',
      tags: ['imported', 'shapefile'],
      source: 'shapefile-import',
      context
    })
  }

  static extractGeopackageMetadata(
    geoJson: GeoJsonLike,
    context?: Record<string, unknown>
  ): LayerMetadata {
    return this.buildVectorMetadata(geoJson, {
      description: 'Imported GeoPackage',
      tags: ['imported', 'geopackage'],
      source: 'geopackage-import',
      context
    })
  }

  private static determineGeometryType(features: FeatureLike[]): GeometryType {
    if (features.length === 0) {
      return 'Point'
    }

    const geometryCounts = new Map<GeometryType, number>()
    for (const feature of features) {
      if (!feature.geometry?.type) {
        continue
      }

      const geometryType = feature.geometry.type as GeometryType
      geometryCounts.set(geometryType, (geometryCounts.get(geometryType) || 0) + 1)
    }

    let primaryType: GeometryType = 'Point'
    let maxCount = 0
    for (const [geometryType, count] of geometryCounts.entries()) {
      if (count > maxCount) {
        primaryType = geometryType
        maxCount = count
      }
    }

    return primaryType
  }

  private static calculateBounds(features: FeatureLike[]): BoundingBox | undefined {
    let minLng = Number.POSITIVE_INFINITY
    let minLat = Number.POSITIVE_INFINITY
    let maxLng = Number.NEGATIVE_INFINITY
    let maxLat = Number.NEGATIVE_INFINITY

    for (const feature of features) {
      if (!feature.geometry?.coordinates) {
        continue
      }

      this.traverseCoordinates(feature.geometry.coordinates, (lng, lat) => {
        minLng = Math.min(minLng, lng)
        minLat = Math.min(minLat, lat)
        maxLng = Math.max(maxLng, lng)
        maxLat = Math.max(maxLat, lat)
      })
    }

    if (![minLng, minLat, maxLng, maxLat].every((value) => Number.isFinite(value))) {
      return undefined
    }

    return [minLng, minLat, maxLng, maxLat]
  }

  private static traverseCoordinates(
    coordinates: unknown,
    callback: (lng: number, lat: number) => void
  ): void {
    if (this.isCoordinatePair(coordinates)) {
      callback(coordinates[0], coordinates[1])
      return
    }

    if (!Array.isArray(coordinates)) {
      return
    }

    for (const coordinate of coordinates) {
      this.traverseCoordinates(coordinate, callback)
    }
  }

  private static extractAttributeSchema(
    features: FeatureLike[]
  ): Record<string, { type: 'string' | 'number' | 'boolean'; nullable: boolean }> {
    if (features.length === 0) {
      return {}
    }

    const attributes: Record<string, { type: 'string' | 'number' | 'boolean'; nullable: boolean }> =
      {}
    const sampleProperties = features[0].properties || {}

    for (const [key, value] of Object.entries(sampleProperties)) {
      attributes[key] = {
        type: this.inferDataType(value),
        nullable: value === null || value === undefined
      }
    }

    return attributes
  }

  private static inferDataType(value: unknown): 'string' | 'number' | 'boolean' {
    if (typeof value === 'number') {
      return 'number'
    }

    if (typeof value === 'boolean') {
      return 'boolean'
    }

    return 'string'
  }

  private static isCoordinatePair(value: unknown): value is CoordinateLike {
    return (
      Array.isArray(value) &&
      value.length >= 2 &&
      typeof value[0] === 'number' &&
      typeof value[1] === 'number'
    )
  }

  private static buildVectorMetadata(
    geoJson: GeoJsonLike,
    options: {
      description: string
      tags: string[]
      source: string
      context?: Record<string, unknown>
    }
  ): LayerMetadata {
    const features = geoJson.features || []
    const featureCount = features.length

    return {
      description: `${options.description} with ${featureCount} features`,
      tags: options.tags,
      source: options.source,
      geometryType: this.determineGeometryType(features),
      featureCount,
      bounds: this.calculateBounds(features),
      crs: 'EPSG:4326',
      attributes: this.extractAttributeSchema(features),
      context: options.context
    }
  }
}
