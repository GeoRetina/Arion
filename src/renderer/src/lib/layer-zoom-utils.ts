/**
 * Layer Zoom Utilities
 *
 * Utilities for zooming to layers on the map, including bounds calculation
 * and map view manipulation. Provides a centralized location for zoom-related
 * functionality to improve maintainability.
 */

import type { Map } from 'maplibre-gl'
import * as turf from '@turf/turf'
import type { LayerDefinition } from '../../../shared/types/layer-types'

export interface ZoomToLayerOptions {
  padding?: number
  maxZoom?: number
  duration?: number
  animate?: boolean
}

export interface LayerBounds {
  bounds: [number, number, number, number]
  isPoint: boolean
  isValid: boolean
}

/**
 * Layer Zoom Service
 * Handles all layer zoom operations with proper error handling and validation
 */
export class LayerZoomService {
  /**
   * Calculate bounds for a given layer
   */
  static calculateLayerBounds(layer: LayerDefinition): LayerBounds {
    let bounds: [number, number, number, number] | null = null
    let isPoint = false

    // Try to get bounds from layer metadata first
    if (layer.metadata.bounds && Array.isArray(layer.metadata.bounds)) {
      bounds = layer.metadata.bounds as [number, number, number, number]
      isPoint = layer.metadata.geometryType === 'Point'
    }

    // If no bounds in metadata, try to calculate from source data
    if (!bounds && layer.sourceConfig.data) {
      try {
        const sourceData = layer.sourceConfig.data

        if (typeof sourceData === 'object') {
          if (sourceData.type === 'FeatureCollection') {
            // Calculate bounds from GeoJSON FeatureCollection
            bounds = turf.bbox(sourceData) as [number, number, number, number]

            // Determine if this is primarily a point layer
            const pointFeatures =
              sourceData.features?.filter(
                (f) => f.geometry?.type === 'Point' || f.geometry?.type === 'MultiPoint'
              ) || []
            isPoint = pointFeatures.length === sourceData.features?.length
          } else if (sourceData.type === 'Feature') {
            // Single feature
            bounds = turf.bbox(sourceData) as [number, number, number, number]
            isPoint =
              sourceData.geometry?.type === 'Point' || sourceData.geometry?.type === 'MultiPoint'
          }
        }
      } catch {
        void 0
      }
    }

    // Validate bounds
    const isValid =
      bounds &&
      bounds.length === 4 &&
      bounds.every((b) => typeof b === 'number' && isFinite(b)) &&
      (isPoint || bounds[0] !== bounds[2] || bounds[1] !== bounds[3]) // Allow zero-area for points

    return {
      bounds: bounds || [0, 0, 0, 0],
      isPoint,
      isValid: !!isValid
    }
  }

  /**
   * Get default zoom options based on geometry type
   */
  static getDefaultZoomOptions(isPoint: boolean): ZoomToLayerOptions {
    return {
      padding: 50,
      maxZoom: isPoint ? 16 : 18,
      duration: 1000,
      animate: true
    }
  }

  /**
   * Zoom to a specific layer on the map
   */
  static async zoomToLayer(
    map: Map,
    layer: LayerDefinition,
    options?: Partial<ZoomToLayerOptions>
  ): Promise<boolean> {
    try {
      if (!map || !layer) {
        return false
      }

      // Calculate layer bounds
      const layerBounds = this.calculateLayerBounds(layer)

      if (!layerBounds.isValid) {
        return false
      }

      // Merge options with defaults
      const defaultOptions = this.getDefaultZoomOptions(layerBounds.isPoint)
      const zoomOptions = { ...defaultOptions, ...options }

      // Prepare fitBounds options
      const fitBoundsOptions: maplibregl.FitBoundsOptions = {
        padding: zoomOptions.padding!,
        maxZoom: zoomOptions.maxZoom!,
        duration: zoomOptions.animate ? zoomOptions.duration! : 0
      }

      // Execute zoom
      if (zoomOptions.animate) {
        map.fitBounds(layerBounds.bounds, fitBoundsOptions)
      } else {
        // Use jumpTo for immediate zoom without animation
        const center = [
          (layerBounds.bounds[0] + layerBounds.bounds[2]) / 2,
          (layerBounds.bounds[1] + layerBounds.bounds[3]) / 2
        ] as [number, number]

        map.jumpTo({
          center,
          zoom: Math.min(zoomOptions.maxZoom!, 18)
        })
      }

      return true
    } catch {
      return false
    }
  }

  /**
   * Zoom to multiple layers by calculating combined bounds
   */
  static async zoomToLayers(
    map: Map,
    layers: LayerDefinition[],
    options?: Partial<ZoomToLayerOptions>
  ): Promise<boolean> {
    try {
      if (!map || !layers || layers.length === 0) {
        return false
      }

      // Calculate bounds for all layers
      const allBounds: [number, number, number, number][] = []
      let hasAnyPoints = false

      for (const layer of layers) {
        const layerBounds = this.calculateLayerBounds(layer)
        if (layerBounds.isValid) {
          allBounds.push(layerBounds.bounds)
          if (layerBounds.isPoint) {
            hasAnyPoints = true
          }
        }
      }

      if (allBounds.length === 0) {
        return false
      }

      // Calculate combined bounds
      const combinedBounds: [number, number, number, number] = [
        Math.min(...allBounds.map((b) => b[0])), // minLng
        Math.min(...allBounds.map((b) => b[1])), // minLat
        Math.max(...allBounds.map((b) => b[2])), // maxLng
        Math.max(...allBounds.map((b) => b[3])) // maxLat
      ]

      // Merge options with defaults
      const defaultOptions = this.getDefaultZoomOptions(hasAnyPoints)
      const zoomOptions = { ...defaultOptions, ...options }

      // Execute zoom to combined bounds
      map.fitBounds(combinedBounds, {
        padding: zoomOptions.padding!,
        maxZoom: zoomOptions.maxZoom!,
        duration: zoomOptions.animate ? zoomOptions.duration! : 0
      })

      return true
    } catch {
      return false
    }
  }

  /**
   * Check if a layer has valid bounds for zooming
   */
  static canZoomToLayer(layer: LayerDefinition): boolean {
    const bounds = this.calculateLayerBounds(layer)
    return bounds.isValid
  }

  /**
   * Get layer bounds without zooming (useful for UI validation)
   */
  static getLayerBounds(layer: LayerDefinition): LayerBounds {
    return this.calculateLayerBounds(layer)
  }
}

/**
 * Convenience function for zooming to a single layer
 */
export const zoomToLayer = (
  map: Map,
  layer: LayerDefinition,
  options?: Partial<ZoomToLayerOptions>
): Promise<boolean> => {
  return LayerZoomService.zoomToLayer(map, layer, options)
}

/**
 * Convenience function for zooming to multiple layers
 */
export const zoomToLayers = (
  map: Map,
  layers: LayerDefinition[],
  options?: Partial<ZoomToLayerOptions>
): Promise<boolean> => {
  return LayerZoomService.zoomToLayers(map, layers, options)
}

/**
 * Convenience function to check if layer can be zoomed to
 */
export const canZoomToLayer = (layer: LayerDefinition): boolean => {
  return LayerZoomService.canZoomToLayer(layer)
}
