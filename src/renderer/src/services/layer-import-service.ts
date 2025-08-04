/**
 * Layer Import Service
 *
 * Handles importing vector and raster layers from various file formats.
 * Provides file validation, processing, and layer creation capabilities.
 */

import { v4 as uuidv4 } from 'uuid'
import shp from 'shpjs'
import proj4 from 'proj4'
import reproject from 'reproject'
import type {
  LayerDefinition,
  ImportFormat,
  LayerType,
  LayerSourceConfig,
  LayerStyle,
  LayerMetadata,
  GeometryType,
  BoundingBox
} from '../../../shared/types/layer-types'

// Supported file types and their MIME types
export const SUPPORTED_FORMATS = {
  // Vector formats
  'application/json': 'geojson',
  'application/geo+json': 'geojson',
  'text/json': 'geojson',
  'application/vnd.google-earth.kml+xml': 'kml',
  'application/vnd.google-earth.kmz': 'kmz',
  'application/gpx+xml': 'gpx',
  'text/csv': 'csv',
  'application/vnd.ms-excel': 'excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',

  // Shapefile (as ZIP archive)
  'application/zip': 'shapefile',
  'application/x-zip-compressed': 'shapefile',

  // Raster formats
  'image/tiff': 'geotiff',
  'image/tif': 'geotiff',
  'image/png': 'geotiff',
  'image/jpeg': 'geotiff',
  'image/jpg': 'geotiff',
  'image/webp': 'geotiff'
} as const

export type SupportedMimeType = keyof typeof SUPPORTED_FORMATS
export type SupportedFormat = (typeof SUPPORTED_FORMATS)[SupportedMimeType]

export interface ImportResult {
  success: boolean
  layerIds: string[]
  errors: string[]
  warnings: string[]
}

export class LayerImportService {
  /**
   * Validate if file is supported for import
   */
  static validateFile(file: File): { valid: boolean; format?: ImportFormat; error?: string } {
    // Check file size (100MB limit)
    const maxSizeBytes = 100 * 1024 * 1024
    if (file.size > maxSizeBytes) {
      return {
        valid: false,
        error: `File size (${Math.round(file.size / 1024 / 1024)}MB) exceeds limit of 100MB`
      }
    }

    // Check MIME type first
    let format = SUPPORTED_FORMATS[file.type as SupportedMimeType]

    // Special handling for ZIP files - they could be shapefiles or other formats
    if (file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
      // For ZIP files, assume shapefile unless filename suggests otherwise
      const fileName = file.name.toLowerCase()
      if (fileName.includes('shp') || fileName.includes('shapefile') || !fileName.includes('.')) {
        format = 'shapefile'
      }
    }

    if (!format) {
      // Fallback to file extension check
      const extension = file.name.toLowerCase().split('.').pop()
      const formatFromExt = this.getFormatFromExtension(extension)

      if (!formatFromExt) {
        return {
          valid: false,
          error: `Unsupported file format: ${file.type || 'unknown'}. Supported formats: GeoJSON, Shapefile (ZIP), KML, CSV, GeoTIFF`
        }
      }

      return { valid: true, format: formatFromExt }
    }

    return { valid: true, format }
  }

  /**
   * Get format from file extension
   */
  private static getFormatFromExtension(ext?: string): ImportFormat | null {
    if (!ext) return null

    const extensionMap: Record<string, ImportFormat> = {
      json: 'geojson',
      geojson: 'geojson',
      kml: 'kml',
      kmz: 'kmz',
      gpx: 'gpx',
      csv: 'csv',
      xlsx: 'excel',
      xls: 'excel',
      zip: 'shapefile', // Assume ZIP files contain shapefiles
      tif: 'geotiff',
      tiff: 'geotiff',
      png: 'geotiff', // Treat as potential world file image
      jpg: 'geotiff',
      jpeg: 'geotiff'
    }

    return extensionMap[ext] || null
  }

  /**
   * Process file and create layer definition
   */
  static async processFile(file: File, format: ImportFormat): Promise<LayerDefinition> {
    const layerId = uuidv4()
    const fileName = file.name.replace(/\.[^/.]+$/, '') // Remove extension

    try {
      switch (format) {
        case 'geojson':
          return await this.processGeoJSON(file, layerId, fileName)
        case 'shapefile':
          return await this.processShapefile(file, layerId, fileName)
        case 'kml':
        case 'kmz':
          return await this.processKML(file, layerId, fileName, format)
        case 'csv':
          return await this.processCSV(file, layerId, fileName)
        case 'geotiff':
          return await this.processRaster(file, layerId, fileName)
        default:
          throw new Error(`Processing for ${format} format not yet implemented`)
      }
    } catch (error) {
      throw new Error(
        `Failed to process ${format} file: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Process GeoJSON file
   */
  private static async processGeoJSON(
    file: File,
    layerId: string,
    fileName: string
  ): Promise<LayerDefinition> {
    const text = await file.text()
    let geoJsonData: any

    try {
      geoJsonData = JSON.parse(text)
    } catch (error) {
      throw new Error('Invalid JSON format')
    }

    if (!geoJsonData.type || geoJsonData.type !== 'FeatureCollection') {
      // Convert single feature or geometry to FeatureCollection
      if (geoJsonData.type === 'Feature') {
        geoJsonData = {
          type: 'FeatureCollection',
          features: [geoJsonData]
        }
      } else if (geoJsonData.type && geoJsonData.coordinates) {
        // Single geometry
        geoJsonData = {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: geoJsonData,
              properties: {}
            }
          ]
        }
      } else {
        throw new Error('Invalid GeoJSON structure')
      }
    }

    const metadata = this.extractGeoJSONMetadata(geoJsonData)
    const style = this.createDefaultVectorStyle(metadata.geometryType)

    return {
      id: layerId,
      name: fileName,
      type: 'vector' as LayerType,
      sourceId: `source-${layerId}`,
      sourceConfig: {
        type: 'geojson',
        data: geoJsonData
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
   * Process Shapefile (ZIP archive)
   */
  private static async processShapefile(
    file: File,
    layerId: string,
    fileName: string
  ): Promise<LayerDefinition> {
    // Read file as ArrayBuffer for shpjs
    const arrayBuffer = await file.arrayBuffer()

    try {
      // Parse shapefile using shpjs - it handles ZIP files automatically
      let geoJsonData = await shp(arrayBuffer)

      // shpjs can return a single FeatureCollection or an array of FeatureCollections
      // If it's an array, take the first one or merge them
      if (Array.isArray(geoJsonData)) {
        if (geoJsonData.length === 0) {
          throw new Error('No valid shapefiles found in ZIP archive')
        }

        // If multiple shapefiles, merge them into a single FeatureCollection
        if (geoJsonData.length > 1) {
          const mergedFeatures: any[] = []
          geoJsonData.forEach((fc) => {
            if (fc.features && Array.isArray(fc.features)) {
              mergedFeatures.push(...fc.features)
            }
          })

          geoJsonData = {
            type: 'FeatureCollection',
            features: mergedFeatures
          }
        } else {
          geoJsonData = geoJsonData[0]
        }
      }

      // Ensure we have a valid FeatureCollection
      if (!geoJsonData || !geoJsonData.features || !Array.isArray(geoJsonData.features)) {
        throw new Error('Invalid shapefile structure - no features found')
      }

      // shpjs automatically projects to WGS84, so coordinates should be in lat/lng
      // But we can still validate/reproject if needed using proj4/reproject

      const metadata = this.extractShapefileMetadata(geoJsonData, fileName)
      const style = this.createDefaultVectorStyle(metadata.geometryType)

      return {
        id: layerId,
        name: fileName,
        type: 'vector' as LayerType,
        sourceId: `source-${layerId}`,
        sourceConfig: {
          type: 'geojson',
          data: geoJsonData
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
   * Process KML/KMZ file (placeholder)
   */
  private static async processKML(
    _file: File,
    _layerId: string,
    _fileName: string,
    format: 'kml' | 'kmz'
  ): Promise<LayerDefinition> {
    // For now, throw error indicating this needs implementation
    throw new Error(`${format.toUpperCase()} import will be implemented in Phase 4`)
  }

  /**
   * Process CSV file (placeholder)
   */
  private static async processCSV(
    _file: File,
    _layerId: string,
    _fileName: string
  ): Promise<LayerDefinition> {
    throw new Error('CSV import will be implemented in Phase 4')
  }

  /**
   * Process raster file (placeholder)
   */
  private static async processRaster(
    _file: File,
    _layerId: string,
    _fileName: string
  ): Promise<LayerDefinition> {
    throw new Error('Raster import will be implemented in Phase 4')
  }

  /**
   * Extract metadata from Shapefile (converted to GeoJSON)
   */
  private static extractShapefileMetadata(geoJson: any, fileName: string): LayerMetadata {
    const features = geoJson.features || []
    const featureCount = features.length

    // Determine geometry type from first feature
    let geometryType: GeometryType = 'Point'
    if (features.length > 0 && features[0].geometry) {
      geometryType = features[0].geometry.type as GeometryType
    }

    // Calculate bounds
    let bounds: BoundingBox | undefined
    if (features.length > 0) {
      bounds = this.calculateBounds(features)
    }

    // Extract attribute schema from first feature
    const attributes: Record<string, any> = {}
    if (features.length > 0) {
      const sampleProperties = features[0].properties || {}
      Object.keys(sampleProperties).forEach((key) => {
        const value = sampleProperties[key]
        attributes[key] = {
          type:
            typeof value === 'number'
              ? 'number'
              : typeof value === 'boolean'
                ? 'boolean'
                : 'string',
          nullable: false
        }
      })
    }

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
   * Extract metadata from GeoJSON
   */
  private static extractGeoJSONMetadata(geoJson: any): LayerMetadata {
    const features = geoJson.features || []
    const featureCount = features.length

    // Determine geometry type
    let geometryType: GeometryType = 'Point'
    if (features.length > 0 && features[0].geometry) {
      geometryType = features[0].geometry.type as GeometryType
    }

    // Calculate bounds
    let bounds: BoundingBox | undefined
    if (features.length > 0) {
      bounds = this.calculateBounds(features)
    }

    // Extract unique attributes
    const attributes: Record<string, any> = {}
    if (features.length > 0) {
      const sampleProperties = features[0].properties || {}
      Object.keys(sampleProperties).forEach((key) => {
        const value = sampleProperties[key]
        attributes[key] = {
          type:
            typeof value === 'number'
              ? 'number'
              : typeof value === 'boolean'
                ? 'boolean'
                : 'string',
          nullable: false // Could be more sophisticated
        }
      })
    }

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
   * Calculate bounding box from features
   */
  private static calculateBounds(features: any[]): BoundingBox {
    let minLng = Infinity,
      minLat = Infinity,
      maxLng = -Infinity,
      maxLat = -Infinity

    features.forEach((feature) => {
      if (!feature.geometry || !feature.geometry.coordinates) return

      const coords = feature.geometry.coordinates
      this.traverseCoordinates(coords, (lng: number, lat: number) => {
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
   * Create default style for vector layer
   */
  private static createDefaultVectorStyle(geometryType?: GeometryType): LayerStyle {
    const baseStyle: LayerStyle = {}

    switch (geometryType) {
      case 'Point':
      case 'MultiPoint':
        return {
          ...baseStyle,
          pointRadius: 5,
          pointColor: '#3b82f6',
          pointOpacity: 0.8,
          pointStrokeColor: '#1d4ed8',
          pointStrokeWidth: 1
        }

      case 'LineString':
      case 'MultiLineString':
        return {
          ...baseStyle,
          lineColor: '#10b981',
          lineWidth: 2,
          lineOpacity: 0.8
        }

      case 'Polygon':
      case 'MultiPolygon':
        return {
          ...baseStyle,
          fillColor: '#8b5cf6',
          fillOpacity: 0.3,
          fillOutlineColor: '#7c3aed',
          lineWidth: 1
        }

      default:
        return {
          ...baseStyle,
          pointRadius: 5,
          pointColor: '#6b7280',
          pointOpacity: 0.8
        }
    }
  }
}
