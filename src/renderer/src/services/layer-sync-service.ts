/**
 * Layer Synchronization Service
 *
 * Manages bidirectional synchronization between LayerStore and MapLibre GL.
 * Ensures the map rendering always reflects the layer store state while
 * maintaining optimal performance through batching and debouncing.
 */

import type {
  Map as MapLibreMap,
  LayerSpecification,
  SourceSpecification,
  GeoJSONSource
} from 'maplibre-gl'
import type { GeoJSON } from 'geojson'
import { useLayerStore } from '../stores/layer-store'
import type { LayerDefinition, LayerStyle } from '../../../shared/types/layer-types'

interface SyncOperation {
  type: 'add' | 'update' | 'remove' | 'style' | 'visibility' | 'opacity' | 'reorder'
  layerId: string
  data?:
    | LayerDefinition
    | { current: LayerDefinition; previous: LayerDefinition }
    | LayerStyle
    | boolean
    | number
    | string[]
  timestamp: number
}

interface SyncOptions {
  debounceMs: number
  batchSize: number
  enableLogging: boolean
}

type LayerStoreSnapshot = { layers: Map<string, LayerDefinition>; selectedLayerId: string | null }
type SourceEventLike = { sourceId?: string }
type MapErrorEventLike = { error?: unknown }

export class LayerSyncService {
  private mapInstance: MapLibreMap | null = null
  private unsubscribeStore: (() => void) | null = null
  private syncQueue: SyncOperation[] = []
  private isProcessing = false
  private debounceTimer: NodeJS.Timeout | null = null
  private options: SyncOptions

  // Track which layers are managed by this service
  private managedLayers = new Set<string>()
  private managedSources = new Set<string>()

  // Performance tracking
  private syncStats = {
    totalSyncs: 0,
    totalTime: 0,
    lastSyncTime: 0,
    averageTime: 0,
    errors: 0
  }

  constructor(options: Partial<SyncOptions> = {}) {
    this.options = {
      debounceMs: 100,
      batchSize: 10,
      enableLogging: true,
      ...options
    }

    this.log('LayerSyncService initialized with options:', this.options)
  }

  /**
   * Initialize sync service with MapLibre instance
   */
  initialize(mapInstance: MapLibreMap): void {
    if (this.mapInstance) {
      this.destroy()
    }

    this.mapInstance = mapInstance
    this.setupStoreSubscription()
    this.setupMapEventListeners()

    // Initial sync of existing layers
    this.performInitialSync()

    this.log('LayerSyncService initialized with map instance')
  }

  /**
   * Clean up all subscriptions and listeners
   */
  destroy(): void {
    if (this.unsubscribeStore) {
      this.unsubscribeStore()
      this.unsubscribeStore = null
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    this.removeMapEventListeners()
    this.mapInstance = null
    this.managedLayers.clear()
    this.managedSources.clear()

    this.log('LayerSyncService destroyed')
  }

  /**
   * Get synchronization statistics
   */
  getStats(): {
    totalSyncs: number
    totalTime: number
    lastSyncTime: number
    averageTime: number
    errors: number
  } {
    return { ...this.syncStats }
  }

  /**
   * Force immediate synchronization of all layers
   */
  async forceSyncAll(): Promise<void> {
    if (!this.mapInstance) {
      throw new Error('Map instance not available')
    }

    const startTime = performance.now()
    const store = useLayerStore.getState()
    const layers = Array.from(store.layers.values())

    this.log(`Force syncing ${layers.length} layers`)

    try {
      // Remove all managed layers first
      this.clearManagedLayers()

      // Add all layers back
      for (const layer of layers) {
        await this.syncLayerToMapLibre(layer)
      }

      // Update order
      await this.syncLayerOrder(layers)

      const duration = performance.now() - startTime
      this.updateSyncStats(duration, false)

      this.log(`Force sync completed in ${duration.toFixed(2)}ms`)
    } catch (error) {
      this.updateSyncStats(performance.now() - startTime, true)
      this.log('Force sync failed:', error)
      throw error
    }
  }

  /**
   * Setup store subscription to watch for changes
   */
  private setupStoreSubscription(): void {
    this.unsubscribeStore = useLayerStore.subscribe(
      (state) => ({
        layers: state.layers,
        selectedLayerId: state.selectedLayerId
      }),
      (current, previous) => {
        this.handleStoreChange(current, previous)
      },
      {
        equalityFn: (a: LayerStoreSnapshot, b: LayerStoreSnapshot) => {
          // Custom equality check for performance
          return a.layers === b.layers && a.selectedLayerId === b.selectedLayerId
        }
      }
    )
  }

  /**
   * Setup MapLibre event listeners
   */
  private setupMapEventListeners(): void {
    if (!this.mapInstance) return

    // Listen for map style changes that might affect our layers
    this.mapInstance.on('styledata', this.handleMapStyleChange.bind(this))
    this.mapInstance.on('sourcedataloading', this.handleSourceLoading.bind(this))
    this.mapInstance.on('sourcedatachanged', this.handleSourceChanged.bind(this))
    this.mapInstance.on('error', this.handleMapError.bind(this))
  }

  /**
   * Remove MapLibre event listeners
   */
  private removeMapEventListeners(): void {
    if (!this.mapInstance) return

    this.mapInstance.off('styledata', this.handleMapStyleChange.bind(this))
    this.mapInstance.off('sourcedataloading', this.handleSourceLoading.bind(this))
    this.mapInstance.off('sourcedatachanged', this.handleSourceChanged.bind(this))
    this.mapInstance.off('error', this.handleMapError.bind(this))
  }

  /**
   * Handle store state changes
   */
  private handleStoreChange(
    current: { layers: Map<string, LayerDefinition>; selectedLayerId: string | null },
    previous: { layers: Map<string, LayerDefinition>; selectedLayerId: string | null }
  ): void {
    if (!this.mapInstance || !this.mapInstance.isStyleLoaded()) {
      this.log('Map not ready, deferring sync')
      return
    }

    // Detect changes and queue sync operations
    const currentLayers = new Map(current.layers)
    const previousLayers = new Map(previous.layers)

    // Find added layers
    for (const [id, layer] of currentLayers) {
      if (!previousLayers.has(id)) {
        this.queueSyncOperation({
          type: 'add',
          layerId: id,
          data: layer,
          timestamp: Date.now()
        })
      } else {
        // Check for updates
        const prevLayer = previousLayers.get(id)!
        if (this.hasLayerChanged(layer, prevLayer)) {
          this.queueSyncOperation({
            type: 'update',
            layerId: id,
            data: { current: layer, previous: prevLayer },
            timestamp: Date.now()
          })
        }
      }
    }

    // Find removed layers
    for (const [id] of previousLayers) {
      if (!currentLayers.has(id)) {
        this.queueSyncOperation({
          type: 'remove',
          layerId: id,
          timestamp: Date.now()
        })
      }
    }

    // Check if layer order changed
    const currentOrder = Array.from(currentLayers.values())
      .sort((a, b) => b.zIndex - a.zIndex)
      .map((l) => l.id)
    const previousOrder = Array.from(previousLayers.values())
      .sort((a, b) => b.zIndex - a.zIndex)
      .map((l) => l.id)

    if (JSON.stringify(currentOrder) !== JSON.stringify(previousOrder)) {
      this.queueSyncOperation({
        type: 'reorder',
        layerId: 'all',
        data: currentOrder,
        timestamp: Date.now()
      })
    }

    this.processSyncQueue()
  }

  /**
   * Check if a layer has meaningful changes that require sync
   */
  private hasLayerChanged(current: LayerDefinition, previous: LayerDefinition): boolean {
    // Check properties that affect MapLibre rendering
    return (
      current.visibility !== previous.visibility ||
      current.opacity !== previous.opacity ||
      current.zIndex !== previous.zIndex ||
      JSON.stringify(current.style) !== JSON.stringify(previous.style) ||
      JSON.stringify(current.sourceConfig) !== JSON.stringify(previous.sourceConfig)
    )
  }

  /**
   * Queue a sync operation
   */
  private queueSyncOperation(operation: SyncOperation): void {
    // Avoid duplicate operations for the same layer
    const existingIndex = this.syncQueue.findIndex(
      (op) => op.layerId === operation.layerId && op.type === operation.type
    )

    if (existingIndex >= 0) {
      // Replace existing operation with newer one
      this.syncQueue[existingIndex] = operation
    } else {
      this.syncQueue.push(operation)
    }
  }

  /**
   * Process the sync queue with debouncing
   */
  private processSyncQueue(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      this.executeSyncOperations()
    }, this.options.debounceMs)
  }

  /**
   * Execute pending sync operations
   */
  private async executeSyncOperations(): Promise<void> {
    if (this.isProcessing || this.syncQueue.length === 0 || !this.mapInstance) {
      return
    }

    this.isProcessing = true
    const startTime = performance.now()

    try {
      const operations = this.syncQueue.splice(0, this.options.batchSize)
      this.log(`Processing ${operations.length} sync operations`)

      for (const operation of operations) {
        await this.executeSyncOperation(operation)
      }

      // Process remaining operations if any
      if (this.syncQueue.length > 0) {
        setTimeout(() => this.executeSyncOperations(), 0)
      }

      const duration = performance.now() - startTime
      this.updateSyncStats(duration, false)
    } catch (error) {
      this.updateSyncStats(performance.now() - startTime, true)
      this.log('Sync operation failed:', error)
      throw error
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Execute a single sync operation
   */
  private async executeSyncOperation(operation: SyncOperation): Promise<void> {
    const { type, layerId, data } = operation

    switch (type) {
      case 'add':
        await this.syncLayerToMapLibre(data as LayerDefinition)
        break
      case 'update':
        if (data && typeof data === 'object' && 'current' in data && 'previous' in data) {
          const updateData = data as { current: LayerDefinition; previous: LayerDefinition }
          await this.updateLayerInMapLibre(layerId, updateData.current, updateData.previous)
        }
        break
      case 'remove':
        await this.removeLayerFromMapLibre(layerId)
        break
      case 'style':
        await this.syncLayerStyle(layerId, data as LayerStyle)
        break
      case 'visibility':
        await this.syncLayerVisibility(layerId, Boolean(data))
        break
      case 'opacity':
        await this.syncLayerOpacity(layerId, Number(data))
        break
      case 'reorder':
        {
          const store = useLayerStore.getState()
          const layers = Array.from(store.layers.values())
          await this.syncLayerOrder(layers)
        }
        break
      default:
        this.log(`Unknown sync operation type: ${type}`)
    }
  }

  /**
   * Sync a layer to MapLibre GL
   */
  private async syncLayerToMapLibre(layer: LayerDefinition): Promise<void> {
    if (!this.mapInstance || !layer) return

    try {
      // Add source if it doesn't exist
      if (!this.mapInstance.getSource(layer.sourceId)) {
        const sourceSpec = this.createSourceSpecification(layer)
        this.mapInstance.addSource(layer.sourceId, sourceSpec)
        this.managedSources.add(layer.sourceId)
        this.log(`Added source: ${layer.sourceId}`)
      }

      // Create layer specifications based on layer type and geometry
      const layerSpecs = this.createLayerSpecifications(layer)

      for (const layerSpec of layerSpecs) {
        if (!this.mapInstance.getLayer(layerSpec.id)) {
          this.mapInstance.addLayer(layerSpec)
          this.managedLayers.add(layerSpec.id)
          this.log(`Added layer: ${layerSpec.id}`)
        }
      }

      // Apply initial styling and properties
      await this.syncLayerProperties(layer)
    } catch (error) {
      this.log(`Failed to sync layer ${layer.id} to MapLibre:`, error)
      throw error
    }
  }

  /**
   * Update an existing layer in MapLibre
   */
  private async updateLayerInMapLibre(
    layerId: string,
    current: LayerDefinition,
    previous: LayerDefinition
  ): Promise<void> {
    if (!this.mapInstance) return

    try {
      // If source config changed, we need to update the source
      if (JSON.stringify(current.sourceConfig) !== JSON.stringify(previous.sourceConfig)) {
        const source = this.mapInstance.getSource(current.sourceId)
        if (source && source.type === 'geojson') {
          ;(source as GeoJSONSource).setData(current.sourceConfig.data as GeoJSON)
          this.log(`Updated source data: ${current.sourceId}`)
        }
      }

      // Update layer properties
      await this.syncLayerProperties(current)
    } catch (error) {
      this.log(`Failed to update layer ${layerId}:`, error)
      throw error
    }
  }

  /**
   * Remove a layer from MapLibre
   */
  private async removeLayerFromMapLibre(layerId: string): Promise<void> {
    if (!this.mapInstance) return

    try {
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
          this.log(`Removed layer: ${layer.id}`)
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
          this.log(`Removed source: ${sourceId}`)
        }
      }
    } catch (error) {
      this.log(`Failed to remove layer ${layerId}:`, error)
      throw error
    }
  }

  /**
   * Sync layer properties (visibility, opacity, style)
   */
  private async syncLayerProperties(layer: LayerDefinition): Promise<void> {
    if (!this.mapInstance) return

    try {
      const style = this.mapInstance.getStyle()
      const layersToUpdate = style.layers.filter(
        (mapLayer) => 'source' in mapLayer && mapLayer.source === layer.sourceId
      )

      for (const mapLayer of layersToUpdate) {
        // Sync visibility
        const visibility = layer.visibility ? 'visible' : 'none'
        this.mapInstance.setLayoutProperty(mapLayer.id, 'visibility', visibility)

        // Sync layer-specific styling based on layer type
        this.applyLayerStyle(mapLayer.id, mapLayer.type, layer.style, layer.opacity)
      }
    } catch (error) {
      this.log(`Failed to sync properties for layer ${layer.id}:`, error)
      throw error
    }
  }

  /**
   * Apply style properties to a specific MapLibre layer
   */
  private applyLayerStyle(
    mapLayerId: string,
    mapLayerType: string,
    style: LayerStyle,
    opacity: number
  ): void {
    if (!this.mapInstance) return

    try {
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
    } catch (error) {
      this.log(`Failed to apply style to layer ${mapLayerId}:`, error)
      throw error
    }
  }

  /**
   * Create MapLibre source specification from layer definition
   */
  private createSourceSpecification(layer: LayerDefinition): SourceSpecification {
    const { sourceConfig } = layer

    switch (sourceConfig.type) {
      case 'geojson':
        return {
          type: 'geojson',
          data: sourceConfig.data as GeoJSON,
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
   * Create MapLibre layer specifications from layer definition
   */
  private createLayerSpecifications(layer: LayerDefinition): LayerSpecification[] {
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
   * Sync layer order in MapLibre
   */
  private async syncLayerOrder(layers: LayerDefinition[]): Promise<void> {
    if (!this.mapInstance) return

    try {
      // Sort layers by zIndex (ascending for proper ordering)
      const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex)

      // Move layers to correct positions
      for (let i = 0; i < sortedLayers.length; i++) {
        const layer = sortedLayers[i]
        const style = this.mapInstance.getStyle()
        const mapLayers = style.layers.filter(
          (ml) => 'source' in ml && ml.source === layer.sourceId
        )

        for (const mapLayer of mapLayers) {
          if (this.mapInstance.getLayer(mapLayer.id)) {
            // Move layer - this is complex in MapLibre, so we'll skip for now
            // and focus on other sync operations
          }
        }
      }
    } catch (error) {
      this.log('Failed to sync layer order:', error)
      throw error
    }
  }

  /**
   * Sync specific layer visibility
   */
  private async syncLayerVisibility(layerId: string, visible: boolean): Promise<void> {
    const layer = useLayerStore.getState().getLayer(layerId)
    if (!layer || !this.mapInstance) return

    const style = this.mapInstance.getStyle()
    const layersToUpdate = style.layers.filter(
      (ml) => 'source' in ml && ml.source === layer.sourceId
    )

    const visibility = visible ? 'visible' : 'none'
    for (const mapLayer of layersToUpdate) {
      this.mapInstance.setLayoutProperty(mapLayer.id, 'visibility', visibility)
    }
  }

  /**
   * Sync specific layer opacity
   */
  private async syncLayerOpacity(layerId: string, opacity: number): Promise<void> {
    void opacity
    const layer = useLayerStore.getState().getLayer(layerId)
    if (!layer || !this.mapInstance) return

    await this.syncLayerProperties(layer)
  }

  /**
   * Sync specific layer style
   */
  private async syncLayerStyle(layerId: string, style: LayerStyle): Promise<void> {
    void style
    const layer = useLayerStore.getState().getLayer(layerId)
    if (!layer || !this.mapInstance) return

    await this.syncLayerProperties(layer)
  }

  /**
   * Perform initial sync of existing layers
   */
  private performInitialSync(): void {
    const store = useLayerStore.getState()
    const layers = Array.from(store.layers.values())

    if (layers.length > 0) {
      this.log(`Performing initial sync of ${layers.length} layers`)
      // Queue all layers for sync
      for (const layer of layers) {
        this.queueSyncOperation({
          type: 'add',
          layerId: layer.id,
          data: layer,
          timestamp: Date.now()
        })
      }
      this.processSyncQueue()
    }
  }

  /**
   * Clear all managed layers from MapLibre
   */
  private clearManagedLayers(): void {
    if (!this.mapInstance) return

    for (const layerId of this.managedLayers) {
      if (this.mapInstance.getLayer(layerId)) {
        this.mapInstance.removeLayer(layerId)
      }
    }

    for (const sourceId of this.managedSources) {
      if (this.mapInstance.getSource(sourceId)) {
        this.mapInstance.removeSource(sourceId)
      }
    }

    this.managedLayers.clear()
    this.managedSources.clear()
  }

  /**
   * Handle map style change events
   */
  private handleMapStyleChange(): void {
    this.log('Map style changed, re-syncing layers')
    // Re-sync all layers when style changes
    setTimeout(() => this.performInitialSync(), 100)
  }

  /**
   * Handle source loading events
   */
  private handleSourceLoading(event: SourceEventLike): void {
    const sourceId = event.sourceId
    if (typeof sourceId === 'string' && this.managedSources.has(sourceId)) {
      this.log(`Source loading: ${sourceId}`)
    }
  }

  /**
   * Handle source data changed events
   */
  private handleSourceChanged(event: SourceEventLike): void {
    const sourceId = event.sourceId
    if (typeof sourceId === 'string' && this.managedSources.has(sourceId)) {
      this.log(`Source data changed: ${sourceId}`)
    }
  }

  /**
   * Handle map errors
   */
  private handleMapError(event: MapErrorEventLike): void {
    this.log('Map error:', event.error)
    this.updateSyncStats(0, true)
  }

  /**
   * Update synchronization statistics
   */
  private updateSyncStats(duration: number, isError: boolean): void {
    this.syncStats.totalSyncs++
    this.syncStats.lastSyncTime = duration

    if (isError) {
      this.syncStats.errors++
    } else {
      this.syncStats.totalTime += duration
      this.syncStats.averageTime =
        this.syncStats.totalTime / (this.syncStats.totalSyncs - this.syncStats.errors)
    }
  }

  /**
   * Logging helper
   */
  private log(message: string, ...args: unknown[]): void {
    if (this.options.enableLogging) {
      console.log('[LayerSyncService]', message, ...args)
    }
  }
}

// Export singleton instance
export const layerSyncService = new LayerSyncService()
