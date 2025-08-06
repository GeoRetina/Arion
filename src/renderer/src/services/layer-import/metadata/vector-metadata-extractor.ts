/**
 * Vector Metadata Extractor
 * 
 * Extracts metadata from vector data sources (GeoJSON, Shapefile).
 * Handles geometry analysis, bounds calculation, and attribute inspection.
 */

import type { LayerMetadata, GeometryType, BoundingBox } from '../../../../../shared/types/layer-types'

export class VectorMetadataExtractor {
  /**
   * Extract metadata from GeoJSON data
   */
  static extractGeoJSONMetadata(geoJson: any): LayerMetadata {
    const features = geoJson.features || []
    const featureCount = features.length

    const geometryType = this.determineGeometryType(features)
    const bounds = features.length > 0 ? this.calculateBounds(features) : undefined
    const attributes = this.extractAttributeSchema(features)

    return {
      description: `Imported GeoJSON file with ${featureCount} features`,
      tags: ['imported', 'geojson'],
      source: 'file-import',
      geometryType,
      featureCount,
      bounds,
      crs: 'EPSG:4326', // Assume WGS84 for GeoJSON
      attributes
    }
  }

  /**
   * Extract metadata from Shapefile (converted to GeoJSON)
   */
  static extractShapefileMetadata(geoJson: any, _fileName: string): LayerMetadata {
    const features = geoJson.features || []
    const featureCount = features.length

    const geometryType = this.determineGeometryType(features)
    const bounds = features.length > 0 ? this.calculateBounds(features) : undefined
    const attributes = this.extractAttributeSchema(features)

    return {
      description: `Imported Shapefile with ${featureCount} features`,
      tags: ['imported', 'shapefile'],
      source: 'shapefile-import',
      geometryType,
      featureCount,
      bounds,
      crs: 'EPSG:4326', // shpjs converts to WGS84
      attributes
    }
  }

  /**
   * Determine primary geometry type from features
   */
  private static determineGeometryType(features: any[]): GeometryType {
    if (features.length === 0) return 'Point'

    // Count geometry types
    const geometryCounts = new Map<GeometryType, number>()
    features.forEach((feature) => {
      if (feature.geometry?.type) {
        const type = feature.geometry.type as GeometryType
        geometryCounts.set(type, (geometryCounts.get(type) || 0) + 1)
      }
    })

    // Return the most common geometry type
    let maxCount = 0
    let primaryType: GeometryType = 'Point'
    
    for (const [type, count] of geometryCounts) {
      if (count > maxCount) {
        maxCount = count
        primaryType = type
      }
    }

    return primaryType
  }

  /**
   * Calculate bounding box from features
   */
  private static calculateBounds(features: any[]): BoundingBox {
    let minLng = Infinity
    let minLat = Infinity
    let maxLng = -Infinity
    let maxLat = -Infinity

    features.forEach((feature) => {
      if (!feature.geometry?.coordinates) return

      this.traverseCoordinates(feature.geometry.coordinates, (lng: number, lat: number) => {
        minLng = Math.min(minLng, lng)
        maxLng = Math.max(maxLng, lng)
        minLat = Math.min(minLat, lat)
        maxLat = Math.max(maxLat, lat)
      })
    })

    return [minLng, minLat, maxLng, maxLat]
  }

  /**
   * Recursively traverse coordinate arrays
   */
  private static traverseCoordinates(coords: any, callback: (lng: number, lat: number) => void) {
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      // Single coordinate pair
      callback(coords[0], coords[1])
    } else if (Array.isArray(coords)) {
      // Array of coordinates or nested arrays
      coords.forEach((coord) => this.traverseCoordinates(coord, callback))
    }
  }

  /**
   * Extract attribute schema from features
   */
  private static extractAttributeSchema(features: any[]): Record<string, any> {
    if (features.length === 0) return {}

    const attributes: Record<string, any> = {}
    
    // Use first feature as schema sample
    const sampleProperties = features[0].properties || {}
    Object.keys(sampleProperties).forEach((key) => {
      const value = sampleProperties[key]
      attributes[key] = {
        type: this.inferDataType(value),
        nullable: false // Could be more sophisticated with full analysis
      }
    })

    return attributes
  }

  /**
   * Infer data type from value
   */
  private static inferDataType(value: any): 'string' | 'number' | 'boolean' {
    if (typeof value === 'number') return 'number'
    if (typeof value === 'boolean') return 'boolean'
    return 'string'
  }

  /**
   * Analyze geometry distribution across features
   */
  static analyzeGeometryDistribution(features: any[]): Record<GeometryType, number> {
    const distribution: Record<string, number> = {}
    
    features.forEach((feature) => {
      if (feature.geometry?.type) {
        const type = feature.geometry.type
        distribution[type] = (distribution[type] || 0) + 1
      }
    })

    return distribution as Record<GeometryType, number>
  }

  /**
   * Calculate detailed statistics for numeric attributes
   */
  static calculateAttributeStatistics(features: any[], attributeName: string) {
    const values = features
      .map((f) => f.properties?.[attributeName])
      .filter((v) => typeof v === 'number' && !isNaN(v))

    if (values.length === 0) return null

    const sorted = values.sort((a, b) => a - b)
    const min = sorted[0]
    const max = sorted[sorted.length - 1]
    const sum = values.reduce((a, b) => a + b, 0)
    const mean = sum / values.length

    return {
      min,
      max,
      mean,
      median: sorted[Math.floor(sorted.length / 2)],
      count: values.length,
      unique: new Set(values).size
    }
  }
}