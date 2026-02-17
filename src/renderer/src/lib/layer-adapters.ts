/**
 * Layer Adaptation Utilities
 *
 * Utilities for converting between old map feature formats and new layer management format.
 * This helps maintain compatibility while transitioning to the centralized layer system.
 */

import { v4 as uuidv4 } from 'uuid'
import type { Feature } from 'geojson'
import type {
  AddMapFeaturePayload,
  AddGeoreferencedImageLayerPayload
} from '../../../shared/ipc-types'
import type {
  LayerDefinition,
  LayerSourceConfig,
  LayerStyle,
  LayerMetadata
} from '../../../shared/types/layer-types'
import * as turf from '@turf/turf'

/**
 * Convert AddMapFeaturePayload to LayerDefinition for the new layer system
 */
export function convertFeatureToLayer(payload: AddMapFeaturePayload): LayerDefinition {
  const { feature, sourceId } = payload
  const now = new Date()

  // Generate unique IDs
  const layerId = uuidv4()
  const actualSourceId = sourceId || `feature-source-${layerId}`

  // Determine geometry type for metadata
  const geometryType = feature.geometry.type as LayerMetadata['geometryType']

  // Calculate bounds for metadata
  let bounds: [number, number, number, number] | undefined
  try {
    const bbox = turf.bbox(feature)
    bounds = [bbox[0], bbox[1], bbox[2], bbox[3]]
  } catch {
    void 0
  }

  // Create source configuration
  const sourceConfig: LayerSourceConfig = {
    type: 'geojson',
    data: feature,
    options: {
      buffer: 64,
      tolerance: 0.375
    }
  }

  // Create style based on feature properties and geometry type
  const style: LayerStyle = createStyleFromFeature(feature)

  // Create metadata
  const metadata: LayerMetadata = {
    description: `Feature layer created from ${geometryType}`,
    tags: ['feature', geometryType?.toLowerCase() || 'unknown'],
    geometryType,
    featureCount: 1,
    bounds,
    attributes: feature.properties ? extractAttributeInfo(feature.properties) : {}
  }

  return {
    id: layerId,
    name: feature.properties?.name || `${geometryType} Feature`,
    type: 'vector',
    sourceId: actualSourceId,
    sourceConfig,
    style,
    visibility: true,
    opacity: feature.properties?.opacity || 1,
    zIndex: feature.properties?.zIndex || 0,
    metadata,
    isLocked: false,
    createdBy: 'tool',
    createdAt: now,
    updatedAt: now
  }
}

/**
 * Convert AddGeoreferencedImageLayerPayload to LayerDefinition
 */
export function convertImageToLayer(payload: AddGeoreferencedImageLayerPayload): LayerDefinition {
  const { imageUrl, coordinates, sourceId, layerId, opacity } = payload
  const now = new Date()

  // Generate unique IDs
  const actualLayerId = layerId || uuidv4()
  const actualSourceId = sourceId || `image-source-${actualLayerId}`

  // Calculate bounds from coordinates
  const polygonForBounds = turf.polygon([
    [coordinates[0], coordinates[1], coordinates[2], coordinates[3], coordinates[0]]
  ])
  const bbox = turf.bbox(polygonForBounds)
  const bounds: [number, number, number, number] =
    bbox.length === 4 ? [bbox[0], bbox[1], bbox[2], bbox[3]] : [0, 0, 0, 0]

  // Create source configuration
  const sourceConfig: LayerSourceConfig = {
    type: 'image',
    data: imageUrl,
    options: {
      bounds: coordinates
    }
  }

  // Create raster style
  const style: LayerStyle = {
    rasterOpacity: opacity || 1,
    rasterBrightnessMin: 0,
    rasterBrightnessMax: 1,
    rasterSaturation: 0,
    rasterContrast: 0,
    rasterFadeDuration: 300
  }

  // Create metadata
  const metadata: LayerMetadata = {
    description: `Georeferenced image layer`,
    tags: ['image', 'raster', 'georeferenced'],
    source: imageUrl,
    bounds
  }

  return {
    id: actualLayerId,
    name: `Georeferenced Image`,
    type: 'raster',
    sourceId: actualSourceId,
    sourceConfig,
    style,
    visibility: true,
    opacity: opacity || 1,
    zIndex: 0,
    metadata,
    isLocked: false,
    createdBy: 'tool',
    createdAt: now,
    updatedAt: now
  }
}

/**
 * Create layer style from feature properties and geometry type
 */
function createStyleFromFeature(feature: Feature): LayerStyle {
  const { geometry, properties } = feature
  const style: LayerStyle = {}

  switch (geometry.type) {
    case 'Point':
    case 'MultiPoint':
      style.pointRadius = properties?.radius || 7
      style.pointColor = properties?.color || '#FF4500'
      style.pointOpacity = properties?.opacity || 0.9
      style.pointStrokeColor = properties?.strokeColor || '#FFFFFF'
      style.pointStrokeWidth = properties?.strokeWidth || 1.5
      style.pointStrokeOpacity = 1
      break

    case 'LineString':
    case 'MultiLineString':
      style.lineColor = properties?.color || '#1E90FF'
      style.lineWidth = properties?.width || 3
      style.lineOpacity = properties?.opacity || 0.9
      style.lineCap = 'round'
      style.lineJoin = 'round'
      break

    case 'Polygon':
    case 'MultiPolygon':
      style.fillColor = properties?.fillColor || '#32CD32'
      style.fillOpacity = properties?.fillOpacity || 0.6
      style.fillOutlineColor = properties?.outlineColor || '#000000'
      break
  }

  return style
}

/**
 * Extract attribute information from feature properties
 */
function extractAttributeInfo(properties: Record<string, any>): Record<string, any> {
  const attributes: Record<string, any> = {}

  for (const [key, value] of Object.entries(properties)) {
    // Skip style-related properties
    if (
      [
        'color',
        'opacity',
        'strokeColor',
        'strokeWidth',
        'fillColor',
        'fillOpacity',
        'outlineColor',
        'radius',
        'width'
      ].includes(key)
    ) {
      continue
    }

    let type: string
    if (typeof value === 'string') {
      type = 'string'
    } else if (typeof value === 'number') {
      type = 'number'
    } else if (typeof value === 'boolean') {
      type = 'boolean'
    } else if (value instanceof Date) {
      type = 'date'
    } else {
      type = 'string' // Default fallback
    }

    attributes[key] = {
      type,
      nullable: value === null || value === undefined,
      description: `Property: ${key}`
    }
  }

  return attributes
}

/**
 * Check if a layer was created from a legacy feature
 */
export function isLegacyFeatureLayer(layer: LayerDefinition): boolean {
  return (
    layer.createdBy === 'tool' &&
    layer.sourceConfig.type === 'geojson' &&
    layer.metadata.tags.includes('feature')
  )
}

/**
 * Check if a layer was created from a legacy image
 */
export function isLegacyImageLayer(layer: LayerDefinition): boolean {
  return (
    layer.createdBy === 'tool' &&
    layer.sourceConfig.type === 'image' &&
    layer.metadata.tags.includes('georeferenced')
  )
}
