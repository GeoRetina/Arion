/**
 * MapLibre Integration Utilities
 *
 * Centralized utilities for MapLibre GL JS integration with the layer management system.
 * Handles source creation, layer specifications, synchronization, and styling operations.
 */

import type { Map as MapLibreMap, LayerSpecification, SourceSpecification } from 'maplibre-gl'
import type { LayerDefinition, LayerStyle } from '../../../shared/types/layer-types'

/**
 * MapLibre Integration Manager
 *
 * Manages the synchronization between LayerDefinition objects and MapLibre GL JS
 * map instances, including sources, layers, and styling.
 */
export class MapLibreIntegration {
  private mapInstance: MapLibreMap | null = null
  private managedLayers: Set<string> = new Set()
  private managedSources: Set<string> = new Set()

  constructor(mapInstance?: MapLibreMap) {
    if (mapInstance) {
      this.setMapInstance(mapInstance)
    }
  }

  /**
   * Set or update the MapLibre map instance
   */
  setMapInstance(map: MapLibreMap | null): void {
    this.mapInstance = map
    if (!map) {
      // Clear managed layers/sources when map is removed
      this.managedLayers.clear()
      this.managedSources.clear()
    }
  }

  /**
   * Get the current map instance
   */
  getMapInstance(): MapLibreMap | null {
    return this.mapInstance
  }

  /**
   * Check if map is ready for operations
   */
  private isMapReady(): boolean {
    return this.mapInstance !== null && (this.mapInstance.isStyleLoaded() || false)
  }

  /**
   * Create a MapLibre source specification from a layer definition
   */
  createSourceSpecification(layer: LayerDefinition): SourceSpecification {
    const { sourceConfig } = layer

    switch (sourceConfig.type) {
      case 'geojson':
        return {
          type: 'geojson',
          data: sourceConfig.data as UnsafeAny,
          ...(sourceConfig.options?.buffer && { buffer: sourceConfig.options.buffer }),
          ...(sourceConfig.options?.tolerance && { tolerance: sourceConfig.options.tolerance }),
          ...(sourceConfig.options?.cluster && {
            cluster: sourceConfig.options.cluster,
            clusterMaxZoom: sourceConfig.options.clusterMaxZoom,
            clusterRadius: sourceConfig.options.clusterRadius
          })
        }

      case 'raster':
      case 'xyz':
        return {
          type: 'raster',
          tiles: [sourceConfig.data as string],
          tileSize: sourceConfig.options?.tileSize || 256,
          ...(sourceConfig.options?.attribution && {
            attribution: sourceConfig.options.attribution
          }),
          ...(sourceConfig.options?.minZoom && { minzoom: sourceConfig.options.minZoom }),
          ...(sourceConfig.options?.maxZoom && { maxzoom: sourceConfig.options.maxZoom })
        }

      case 'image':
        return {
          type: 'image',
          url: sourceConfig.data as string,
          coordinates: sourceConfig.options?.bounds
            ? [
                [sourceConfig.options.bounds[0], sourceConfig.options.bounds[1]] as [
                  number,
                  number
                ],
                [sourceConfig.options.bounds[2], sourceConfig.options.bounds[1]] as [
                  number,
                  number
                ],
                [sourceConfig.options.bounds[2], sourceConfig.options.bounds[3]] as [
                  number,
                  number
                ],
                [sourceConfig.options.bounds[0], sourceConfig.options.bounds[3]] as [number, number]
              ]
            : [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1]
              ]
        }

      case 'vector-tiles':
        return {
          type: 'vector',
          tiles: [sourceConfig.data as string],
          ...(sourceConfig.options?.minZoom && { minzoom: sourceConfig.options.minZoom }),
          ...(sourceConfig.options?.maxZoom && { maxzoom: sourceConfig.options.maxZoom }),
          ...(sourceConfig.options?.attribution && {
            attribution: sourceConfig.options.attribution
          })
        }

      default:
        throw new Error(`Unsupported source type: ${sourceConfig.type}`)
    }
  }

  /**
   * Create MapLibre layer specifications from a layer definition
   */
  createLayerSpecifications(layer: LayerDefinition): LayerSpecification[] {
    const specs: LayerSpecification[] = []
    const baseId = layer.id

    if (layer.type === 'vector') {
      // For vector layers, create appropriate layer types based on geometry
      const geometryType = layer.metadata.geometryType

      if (!geometryType || geometryType === 'Point' || geometryType === 'MultiPoint') {
        specs.push({
          id: `${baseId}-point`,
          type: 'circle',
          source: layer.sourceId,
          layout: { visibility: layer.visibility ? 'visible' : 'none' },
          paint: {}
        })
      }

      if (!geometryType || geometryType === 'LineString' || geometryType === 'MultiLineString') {
        specs.push({
          id: `${baseId}-line`,
          type: 'line',
          source: layer.sourceId,
          layout: { visibility: layer.visibility ? 'visible' : 'none' },
          paint: {}
        })
      }

      if (!geometryType || geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
        specs.push({
          id: `${baseId}-fill`,
          type: 'fill',
          source: layer.sourceId,
          layout: { visibility: layer.visibility ? 'visible' : 'none' },
          paint: {}
        })
      }
    } else if (layer.type === 'raster') {
      specs.push({
        id: `${baseId}-raster`,
        type: 'raster',
        source: layer.sourceId,
        layout: { visibility: layer.visibility ? 'visible' : 'none' },
        paint: {}
      })
    }

    return specs
  }

  /**
   * Synchronize a layer definition to the map
   */
  async syncLayerToMap(layer: LayerDefinition): Promise<void> {
    if (!this.isMapReady()) {
      // Defer sync until the map style is ready
      if (this.mapInstance) {
        const retryOnce = (): void => {
          this.mapInstance?.off('load', retryOnce)
          this.mapInstance?.off('styledata', retryOnce)
          // Retry without awaiting to avoid blocking listener thread
          this.syncLayerToMap(layer).catch(() => {})
        }

        this.mapInstance.on('load', retryOnce)
        this.mapInstance.on('styledata', retryOnce)
      }
      return
    }

    {
      // Add source if it doesn't exist
      if (!this.mapInstance!.getSource(layer.sourceId)) {
        const sourceSpec = this.createSourceSpecification(layer)
        this.mapInstance!.addSource(layer.sourceId, sourceSpec)
        this.managedSources.add(layer.sourceId)
      }

      // Create layer specifications based on layer type and geometry
      const layerSpecs = this.createLayerSpecifications(layer)

      for (const layerSpec of layerSpecs) {
        if (!this.mapInstance!.getLayer(layerSpec.id)) {
          this.mapInstance!.addLayer(layerSpec)
          this.managedLayers.add(layerSpec.id)
        }
      }

      // Apply initial styling and properties
      await this.syncLayerProperties(layer)
    }
  }

  /**
   * Remove a layer from the map
   */
  async removeLayerFromMap(layerId: string): Promise<void> {
    if (!this.mapInstance) return

    {
      // Find all MapLibre layers associated with this layer definition
      const style = this.mapInstance.getStyle()
      const layersToRemove = style.layers.filter(
        (layer) =>
          layer.id.startsWith(layerId) ||
          ('source' in layer && this.managedSources.has(layer.source as string))
      )

      // Remove layers
      for (const layer of layersToRemove) {
        if (this.mapInstance.getLayer(layer.id)) {
          this.mapInstance.removeLayer(layer.id)
          this.managedLayers.delete(layer.id)
        }
      }

      // Remove source if no other layers use it
      const sourceId =
        layersToRemove[0] && 'source' in layersToRemove[0]
          ? (layersToRemove[0].source as string)
          : null

      if (sourceId && this.managedSources.has(sourceId)) {
        const remainingLayers = style.layers.filter(
          (layer) => 'source' in layer && layer.source === sourceId
        )

        if (remainingLayers.length === 0 && this.mapInstance.getSource(sourceId)) {
          this.mapInstance.removeSource(sourceId)
          this.managedSources.delete(sourceId)
        }
      }
    }
  }

  /**
   * Synchronize layer properties to the map
   */
  async syncLayerProperties(layer: LayerDefinition): Promise<void> {
    if (!this.mapInstance) return

    {
      const style = this.mapInstance.getStyle()
      const layersToUpdate = style.layers.filter((mapLayer) => mapLayer.id.startsWith(layer.id))

      for (const mapLayer of layersToUpdate) {
        // Sync visibility
        const visibility = layer.visibility ? 'visible' : 'none'
        this.mapInstance.setLayoutProperty(mapLayer.id, 'visibility', visibility)

        // Apply layer-specific styling based on layer type
        await this.applyLayerStyle(mapLayer.id, mapLayer.type, layer.style, layer.opacity)
      }
    }
  }

  /**
   * Apply styling to a specific map layer
   */
  async applyLayerStyle(
    mapLayerId: string,
    mapLayerType: string,
    style: LayerStyle,
    opacity: number
  ): Promise<void> {
    if (!this.mapInstance) return

    {
      switch (mapLayerType) {
        case 'circle':
          if (style.pointColor) {
            this.mapInstance.setPaintProperty(mapLayerId, 'circle-color', style.pointColor)
          }
          if (style.pointRadius !== undefined) {
            this.mapInstance.setPaintProperty(mapLayerId, 'circle-radius', style.pointRadius)
          }
          if (style.pointOpacity !== undefined) {
            this.mapInstance.setPaintProperty(
              mapLayerId,
              'circle-opacity',
              style.pointOpacity * opacity
            )
          }
          if (style.pointStrokeColor) {
            this.mapInstance.setPaintProperty(
              mapLayerId,
              'circle-stroke-color',
              style.pointStrokeColor
            )
          }
          if (style.pointStrokeWidth !== undefined) {
            this.mapInstance.setPaintProperty(
              mapLayerId,
              'circle-stroke-width',
              style.pointStrokeWidth
            )
          }
          if (style.pointStrokeOpacity !== undefined) {
            this.mapInstance.setPaintProperty(
              mapLayerId,
              'circle-stroke-opacity',
              style.pointStrokeOpacity * opacity
            )
          }
          break

        case 'line':
          if (style.lineColor) {
            this.mapInstance.setPaintProperty(mapLayerId, 'line-color', style.lineColor)
          }
          if (style.lineWidth !== undefined) {
            this.mapInstance.setPaintProperty(mapLayerId, 'line-width', style.lineWidth)
          }
          if (style.lineOpacity !== undefined) {
            this.mapInstance.setPaintProperty(
              mapLayerId,
              'line-opacity',
              style.lineOpacity * opacity
            )
          }
          if (style.lineDasharray) {
            this.mapInstance.setPaintProperty(mapLayerId, 'line-dasharray', style.lineDasharray)
          }
          if (style.lineOffset !== undefined) {
            this.mapInstance.setPaintProperty(mapLayerId, 'line-offset', style.lineOffset)
          }
          break

        case 'fill':
          if (style.fillColor) {
            this.mapInstance.setPaintProperty(mapLayerId, 'fill-color', style.fillColor)
          }
          if (style.fillOpacity !== undefined) {
            this.mapInstance.setPaintProperty(
              mapLayerId,
              'fill-opacity',
              style.fillOpacity * opacity
            )
          }
          if (style.fillOutlineColor) {
            this.mapInstance.setPaintProperty(
              mapLayerId,
              'fill-outline-color',
              style.fillOutlineColor
            )
          }
          break

        case 'raster':
          if (style.rasterOpacity !== undefined) {
            this.mapInstance.setPaintProperty(
              mapLayerId,
              'raster-opacity',
              style.rasterOpacity * opacity
            )
          }
          if (style.rasterBrightnessMin !== undefined) {
            this.mapInstance.setPaintProperty(
              mapLayerId,
              'raster-brightness-min',
              style.rasterBrightnessMin
            )
          }
          if (style.rasterBrightnessMax !== undefined) {
            this.mapInstance.setPaintProperty(
              mapLayerId,
              'raster-brightness-max',
              style.rasterBrightnessMax
            )
          }
          if (style.rasterSaturation !== undefined) {
            this.mapInstance.setPaintProperty(
              mapLayerId,
              'raster-saturation',
              style.rasterSaturation
            )
          }
          if (style.rasterContrast !== undefined) {
            this.mapInstance.setPaintProperty(mapLayerId, 'raster-contrast', style.rasterContrast)
          }
          break

        case 'symbol':
          if (style.textField) {
            this.mapInstance.setLayoutProperty(mapLayerId, 'text-field', style.textField)
          }
          if (style.textSize !== undefined) {
            this.mapInstance.setLayoutProperty(mapLayerId, 'text-size', style.textSize)
          }
          if (style.textColor) {
            this.mapInstance.setPaintProperty(mapLayerId, 'text-color', style.textColor)
          }
          if (style.textHaloColor) {
            this.mapInstance.setPaintProperty(mapLayerId, 'text-halo-color', style.textHaloColor)
          }
          if (style.textHaloWidth !== undefined) {
            this.mapInstance.setPaintProperty(mapLayerId, 'text-halo-width', style.textHaloWidth)
          }
          break
      }
    }
  }

  /**
   * Get all managed layers
   */
  getManagedLayers(): Set<string> {
    return new Set(this.managedLayers)
  }

  /**
   * Get all managed sources
   */
  getManagedSources(): Set<string> {
    return new Set(this.managedSources)
  }

  /**
   * Clean up all managed resources from the map
   */
  cleanup(): void {
    if (!this.mapInstance) return

    // Remove all managed layers
    for (const layerId of this.managedLayers) {
      if (this.mapInstance.getLayer(layerId)) {
        this.mapInstance.removeLayer(layerId)
      }
    }

    // Remove all managed sources
    for (const sourceId of this.managedSources) {
      if (this.mapInstance.getSource(sourceId)) {
        this.mapInstance.removeSource(sourceId)
      }
    }

    this.managedLayers.clear()
    this.managedSources.clear()
  }
}

/**
 * Utility functions for MapLibre integration
 */
export const createMapLibreIntegration = (mapInstance?: MapLibreMap): MapLibreIntegration => {
  return new MapLibreIntegration(mapInstance)
}

export const createSourceSpecification = (layer: LayerDefinition): SourceSpecification => {
  const integration = new MapLibreIntegration()
  return integration.createSourceSpecification(layer)
}

export const createLayerSpecifications = (layer: LayerDefinition): LayerSpecification[] => {
  const integration = new MapLibreIntegration()
  return integration.createLayerSpecifications(layer)
}
